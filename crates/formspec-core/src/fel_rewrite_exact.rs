//! Exact-text FEL rewriting that preserves non-reference source text.
//!
//! `ExactRewriteParser` mirrors FEL precedence and records non-overlapping text replacements;
//! see `apply_replacements` for how spans are stitched back into the source.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::lexer::{Lexer, SpannedToken, Token};
use fel_core::{Error, ParseError, parse};

use crate::fel_analysis::{RewriteOptions, rewrite_row_tail};

const RESERVED_CONTEXT_NAMES: &[&str] = &["current", "index", "count", "instance"];

#[derive(Debug, Clone)]
struct Replacement {
    start: usize,
    end: usize,
    text: String,
}

/// Rewrite `$` / `@` references in source text using span-aware lexing (preserves non-ref text).
///
/// On parse failure, returns `expression` unchanged.
pub fn rewrite_fel_source_references(expression: &str, options: &RewriteOptions) -> String {
    if parse(expression).is_err() {
        return expression.to_string();
    }

    let mut lexer = Lexer::new(expression);
    let tokens = match lexer.tokenize() {
        Ok(tokens) => tokens,
        Err(_) => return expression.to_string(),
    };

    let mut parser = ExactRewriteParser::new(expression, tokens, options);
    if parser.parse_expression().is_err() || !parser.at_eof() {
        return expression.to_string();
    }

    apply_replacements(expression, &parser.replacements)
}

/// Rewrite each `{{ ... }}` FEL substring in a message template via [`rewrite_fel_source_references`].
pub fn rewrite_message_template(message: &str, options: &RewriteOptions) -> String {
    let mut output = String::new();
    let mut cursor = 0usize;

    while let Some(start_offset) = message[cursor..].find("{{") {
        let start = cursor + start_offset;
        output.push_str(&message[cursor..start]);
        let expr_start = start + 2;
        if let Some(end_offset) = message[expr_start..].find("}}") {
            let end = expr_start + end_offset;
            output.push_str("{{");
            output.push_str(&rewrite_fel_source_references(
                &message[expr_start..end],
                options,
            ));
            output.push_str("}}");
            cursor = end + 2;
        } else {
            output.push_str(&message[start..]);
            cursor = message.len();
            break;
        }
    }

    if cursor < message.len() {
        output.push_str(&message[cursor..]);
    }

    output
}

struct ExactRewriteParser<'a> {
    source: &'a str,
    tokens: Vec<SpannedToken>,
    pos: usize,
    no_in_depth: usize,
    options: &'a RewriteOptions,
    replacements: Vec<Replacement>,
}

impl<'a> ExactRewriteParser<'a> {
    fn new(source: &'a str, tokens: Vec<SpannedToken>, options: &'a RewriteOptions) -> Self {
        Self {
            source,
            tokens,
            pos: 0,
            no_in_depth: 0,
            options,
            replacements: Vec::new(),
        }
    }

    fn parse_err_current(&self, message: impl Into<String>) -> Error {
        let tok = self.current();
        Error::Parse(ParseError::with_span(
            tok.span.start..tok.span.end,
            message.into(),
        ))
    }

    fn current(&self) -> &SpannedToken {
        &self.tokens[self.pos.min(self.tokens.len().saturating_sub(1))]
    }

    fn peek(&self) -> &Token {
        &self.current().token
    }

    fn at_eof(&self) -> bool {
        matches!(self.peek(), Token::Eof)
    }

    fn advance(&mut self) -> &SpannedToken {
        let tok = &self.tokens[self.pos.min(self.tokens.len().saturating_sub(1))];
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
        tok
    }

    fn expect(&mut self, expected: &Token) -> Result<(), Error> {
        if self.peek() == expected {
            self.advance();
            Ok(())
        } else {
            Err(self.parse_err_current(format!("expected {expected:?}, got {:?}", self.peek())))
        }
    }

    fn eat_identifier(&mut self) -> Result<(String, SpannedToken), Error> {
        match self.peek().clone() {
            Token::Identifier(name) => {
                let token = self.advance().clone();
                Ok((name, token))
            }
            _ => Err(self.parse_err_current(format!("expected identifier, got {:?}", self.peek()))),
        }
    }

    fn parse_expression(&mut self) -> Result<(), Error> {
        self.parse_let_or_if()
    }

    fn parse_let_or_if(&mut self) -> Result<(), Error> {
        if matches!(self.peek(), Token::Let) {
            self.advance();
            self.eat_identifier()?;
            self.expect(&Token::Eq)?;
            self.no_in_depth += 1;
            self.parse_ternary()?;
            self.no_in_depth -= 1;
            self.expect(&Token::In)?;
            return self.parse_let_or_if();
        }

        if matches!(self.peek(), Token::If) && self.is_if_then_else() {
            self.advance();
            self.parse_ternary()?;
            self.expect(&Token::Then)?;
            self.parse_let_or_if()?;
            self.expect(&Token::Else)?;
            return self.parse_let_or_if();
        }

        self.parse_ternary()
    }

    fn is_if_then_else(&self) -> bool {
        let mut depth = 0;
        let mut i = self.pos + 1;
        while i < self.tokens.len() {
            match &self.tokens[i].token {
                Token::Then if depth == 0 => return true,
                Token::LParen | Token::LBracket | Token::LBrace => depth += 1,
                Token::RParen | Token::RBracket | Token::RBrace => {
                    if depth > 0 {
                        depth -= 1;
                    }
                }
                Token::Eof => return false,
                _ => {}
            }
            i += 1;
        }
        false
    }

    fn parse_ternary(&mut self) -> Result<(), Error> {
        self.parse_logical_or()?;
        if matches!(self.peek(), Token::Question) {
            self.advance();
            self.parse_let_or_if()?;
            self.expect(&Token::Colon)?;
            self.parse_let_or_if()?;
        }
        Ok(())
    }

    fn parse_logical_or(&mut self) -> Result<(), Error> {
        self.parse_logical_and()?;
        while matches!(self.peek(), Token::Or) {
            self.advance();
            self.parse_logical_and()?;
        }
        Ok(())
    }

    fn parse_logical_and(&mut self) -> Result<(), Error> {
        self.parse_equality()?;
        while matches!(self.peek(), Token::And) {
            self.advance();
            self.parse_equality()?;
        }
        Ok(())
    }

    fn parse_equality(&mut self) -> Result<(), Error> {
        self.parse_comparison()?;
        while matches!(self.peek(), Token::Eq | Token::NotEq) {
            self.advance();
            self.parse_comparison()?;
        }
        Ok(())
    }

    fn parse_comparison(&mut self) -> Result<(), Error> {
        self.parse_membership()?;
        while matches!(
            self.peek(),
            Token::Lt | Token::Gt | Token::LtEq | Token::GtEq
        ) {
            self.advance();
            self.parse_membership()?;
        }
        Ok(())
    }

    fn parse_membership(&mut self) -> Result<(), Error> {
        self.parse_null_coalesce()?;
        if self.no_in_depth > 0 {
            return Ok(());
        }

        if matches!(self.peek(), Token::Not)
            && self.pos + 1 < self.tokens.len()
            && matches!(self.tokens[self.pos + 1].token, Token::In)
        {
            self.advance();
            self.advance();
            self.parse_null_coalesce()?;
            return Ok(());
        }

        if matches!(self.peek(), Token::In) {
            self.advance();
            self.parse_null_coalesce()?;
        }

        Ok(())
    }

    fn parse_null_coalesce(&mut self) -> Result<(), Error> {
        self.parse_addition()?;
        while matches!(self.peek(), Token::DoubleQuestion) {
            self.advance();
            self.parse_addition()?;
        }
        Ok(())
    }

    fn parse_addition(&mut self) -> Result<(), Error> {
        self.parse_multiplication()?;
        while matches!(self.peek(), Token::Plus | Token::Minus | Token::Ampersand) {
            self.advance();
            self.parse_multiplication()?;
        }
        Ok(())
    }

    fn parse_multiplication(&mut self) -> Result<(), Error> {
        self.parse_unary()?;
        while matches!(self.peek(), Token::Star | Token::Slash | Token::Percent) {
            self.advance();
            self.parse_unary()?;
        }
        Ok(())
    }

    fn parse_unary(&mut self) -> Result<(), Error> {
        if matches!(self.peek(), Token::Not | Token::Bang) {
            if matches!(self.peek(), Token::Not)
                && self.pos + 1 < self.tokens.len()
                && matches!(self.tokens[self.pos + 1].token, Token::In)
            {
                return self.parse_postfix();
            }
            self.advance();
            return self.parse_unary();
        }

        if matches!(self.peek(), Token::Minus) {
            self.advance();
            return self.parse_unary();
        }

        self.parse_postfix()
    }

    fn parse_postfix(&mut self) -> Result<(), Error> {
        let mut field_path = if matches!(self.peek(), Token::Dollar) {
            let start = self.advance().span.start;
            self.parse_field_ref(start)?
        } else {
            self.parse_atom()?;
            self.parse_path_tail()?;
            None
        };

        while matches!(self.peek(), Token::LBracket) {
            if let Some(path) = &mut field_path {
                path.push_str("[*]");
            }
            self.parse_row_lookup(field_path.as_deref())?;
            let start = self.current().span.start;
            let tail = self.parse_path_tail()?;
            if let Some(path) = &mut field_path
                && !tail.is_empty()
            {
                if let Some(updated) = rewrite_row_tail(self.options, path, &tail) {
                    self.replacements.push(Replacement {
                        start,
                        end: self.tokens[self.pos - 1].span.end,
                        text: updated,
                    });
                }
                path.push_str(&tail);
            }
        }
        Ok(())
    }

    fn parse_row_lookup(&mut self, row_path: Option<&str>) -> Result<(), Error> {
        self.expect(&Token::LBracket)?;
        let (first, token) = self.eat_identifier()?;
        let mut tail = format!(".{first}");
        let mut end = token.span.end;
        while matches!(self.peek(), Token::Dot) {
            self.advance();
            let (segment, token) = self.eat_identifier()?;
            tail.push('.');
            tail.push_str(&segment);
            end = token.span.end;
        }
        self.expect(&Token::Eq)?;
        if let Some(path) = row_path
            && let Some(updated) = rewrite_row_tail(self.options, path, &tail)
            && let Some(key_path) = updated.strip_prefix('.')
        {
            self.replacements.push(Replacement {
                start: token.span.start,
                end,
                text: key_path.to_owned(),
            });
        }

        let saved_no_in = self.no_in_depth;
        self.no_in_depth = 0;
        let result = self.parse_expression();
        self.no_in_depth = saved_no_in;
        result?;
        self.expect(&Token::RBracket)
    }

    // Consume ordinary path segments, leaving a keyed selector for parse_postfix.
    fn parse_path_tail(&mut self) -> Result<String, Error> {
        let mut tail = String::new();
        loop {
            match self.peek() {
                Token::Dot => {
                    self.advance();
                    let (segment, _) = self.eat_identifier()?;
                    tail.push('.');
                    tail.push_str(&segment);
                }
                Token::LBracket => {
                    if matches!(&self.tokens[self.pos + 1].token, Token::Identifier(_)) {
                        break;
                    }
                    self.advance();
                    match self.peek().clone() {
                        Token::Star => tail.push_str("[*]"),
                        Token::Number(n) => tail.push_str(&format!("[{n}]")),
                        token => {
                            return Err(self.parse_err_current(format!(
                                "expected number or * in brackets, got {token:?}"
                            )));
                        }
                    }
                    self.advance();
                    self.expect(&Token::RBracket)?;
                }
                _ => break,
            }
        }
        Ok(tail)
    }

    fn parse_atom(&mut self) -> Result<(), Error> {
        match self.peek().clone() {
            Token::Number(_)
            | Token::StringLit(_)
            | Token::True
            | Token::False
            | Token::Null
            | Token::DateLiteral(_)
            | Token::DateTimeLiteral(_) => {
                self.advance();
                Ok(())
            }
            Token::At => {
                let at_token = self.advance().clone();
                self.parse_context_ref(at_token.span.start)
            }
            Token::LParen => {
                self.advance();
                let saved_no_in = self.no_in_depth;
                self.no_in_depth = 0;
                self.parse_expression()?;
                self.expect(&Token::RParen)?;
                self.no_in_depth = saved_no_in;
                Ok(())
            }
            Token::LBracket => self.parse_array_literal(),
            Token::LBrace => self.parse_object_literal(),
            Token::Identifier(name) => {
                self.advance();
                if matches!(self.peek(), Token::LParen) {
                    self.parse_function_call(name)
                } else {
                    Ok(())
                }
            }
            Token::If => {
                self.advance();
                if matches!(self.peek(), Token::LParen) {
                    self.parse_function_call("if".to_string())
                } else {
                    Err(self.parse_err_current("unexpected 'if' — use if...then...else or if(...)"))
                }
            }
            _ => Err(self.parse_err_current(format!("unexpected token {:?}", self.peek()))),
        }
    }

    fn parse_field_ref(&mut self, start: usize) -> Result<Option<String>, Error> {
        let name = if let Token::Identifier(name) = self.peek().clone() {
            self.advance();
            Some(name)
        } else {
            None
        };
        let tail = self.parse_path_tail()?;
        let Some(name) = name else {
            return Ok(None);
        };
        let original = format!("{name}{tail}");
        if let Some(rewrite) = &self.options.rewrite_field_path
            && let Some(updated) = rewrite(&original)
            && updated != original
        {
            self.replacements.push(Replacement {
                start,
                end: self.tokens[self.pos - 1].span.end,
                text: format!("${updated}"),
            });
        }

        Ok(Some(original))
    }

    fn parse_context_ref(&mut self, _start: usize) -> Result<(), Error> {
        let (name, name_token) = self.eat_identifier()?;
        let mut arg_token: Option<SpannedToken> = None;
        let mut arg_value: Option<String> = None;
        let mut tail_tokens: Vec<SpannedToken> = Vec::new();
        let mut tail_names: Vec<String> = Vec::new();

        if matches!(self.peek(), Token::LParen) {
            self.advance();
            if let Token::StringLit(value) = self.peek().clone() {
                arg_value = Some(value);
                arg_token = Some(self.advance().clone());
            }
            self.expect(&Token::RParen)?;
        }

        while matches!(self.peek(), Token::Dot) {
            self.advance();
            let (segment, token) = self.eat_identifier()?;
            tail_names.push(segment);
            tail_tokens.push(token);
        }

        if name == "instance" {
            if let (Some(rewrite), Some(current_name), Some(token)) = (
                &self.options.rewrite_instance_name,
                arg_value.as_deref(),
                arg_token.as_ref(),
            ) && let Some(updated) = rewrite(current_name)
                && updated != current_name
            {
                let quote = nth_char(self.source, token.span.start).unwrap_or('\'');
                self.replacements.push(Replacement {
                    start: token.span.start,
                    end: token.span.end,
                    text: quote_string_literal(&updated, quote),
                });
            }
            return Ok(());
        }

        if name == "current" {
            if let Some(rewrite) = &self.options.rewrite_current_path
                && let (Some(first), Some(last)) = (tail_tokens.first(), tail_tokens.last())
            {
                let current_path = tail_names.join(".");
                if let Some(updated) = rewrite(&current_path)
                    && updated != current_path
                {
                    self.replacements.push(Replacement {
                        start: first.span.start,
                        end: last.span.end,
                        text: updated,
                    });
                }
            }
            return Ok(());
        }

        if arg_token.is_none()
            && !RESERVED_CONTEXT_NAMES.contains(&name.as_str())
            && let Some(rewrite) = &self.options.rewrite_variable
            && let Some(updated) = rewrite(&name)
            && updated != name
        {
            self.replacements.push(Replacement {
                start: name_token.span.start,
                end: name_token.span.end,
                text: updated,
            });
        }

        Ok(())
    }

    fn parse_function_call(&mut self, name: String) -> Result<(), Error> {
        self.expect(&Token::LParen)?;
        let mut first_arg_range: Option<(usize, usize)> = None;
        if !matches!(self.peek(), Token::RParen) {
            let arg_start = self.pos;
            self.parse_expression()?;
            if self.pos > arg_start {
                first_arg_range = Some((arg_start, self.pos - 1));
            }
            while matches!(self.peek(), Token::Comma) {
                self.advance();
                self.parse_expression()?;
            }
        }
        self.expect(&Token::RParen)?;

        if matches!(name.as_str(), "prev" | "next" | "parent")
            && let Some(rewrite) = &self.options.rewrite_navigation_target
            && let Some((start, end)) = first_arg_range
        {
            self.maybe_rewrite_navigation_target(&name, start, end, rewrite);
        }

        Ok(())
    }

    fn maybe_rewrite_navigation_target(
        &mut self,
        function_name: &str,
        start: usize,
        end: usize,
        rewrite: &dyn Fn(&str, &str) -> Option<String>,
    ) {
        if start >= self.tokens.len() || end >= self.tokens.len() || start > end {
            return;
        }

        let mut string_token: Option<&SpannedToken> = None;
        for token in &self.tokens[start..=end] {
            match &token.token {
                Token::StringLit(_) => {
                    if string_token.is_some() {
                        return;
                    }
                    string_token = Some(token);
                }
                Token::LParen | Token::RParen => {}
                _ => return,
            }
        }

        let Some(token) = string_token else {
            return;
        };
        let Token::StringLit(current) = &token.token else {
            return;
        };
        let Some(updated) = rewrite(current, function_name) else {
            return;
        };
        if updated == *current {
            return;
        }

        let quote = nth_char(self.source, token.span.start).unwrap_or('\'');
        self.replacements.push(Replacement {
            start: token.span.start,
            end: token.span.end,
            text: quote_string_literal(&updated, quote),
        });
    }

    fn parse_array_literal(&mut self) -> Result<(), Error> {
        self.expect(&Token::LBracket)?;
        if !matches!(self.peek(), Token::RBracket) {
            self.parse_expression()?;
            while matches!(self.peek(), Token::Comma) {
                self.advance();
                self.parse_expression()?;
            }
        }
        self.expect(&Token::RBracket)?;
        Ok(())
    }

    fn parse_object_literal(&mut self) -> Result<(), Error> {
        self.expect(&Token::LBrace)?;
        if !matches!(self.peek(), Token::RBrace) {
            self.parse_object_entry()?;
            while matches!(self.peek(), Token::Comma) {
                self.advance();
                if matches!(self.peek(), Token::RBrace) {
                    break;
                }
                self.parse_object_entry()?;
            }
        }
        self.expect(&Token::RBrace)?;
        Ok(())
    }

    fn parse_object_entry(&mut self) -> Result<(), Error> {
        match self.peek().clone() {
            Token::Identifier(_) | Token::StringLit(_) => {
                self.advance();
            }
            _ => {
                return Err(
                    self.parse_err_current(format!("expected object key, got {:?}", self.peek()))
                );
            }
        }
        self.expect(&Token::Colon)?;
        self.parse_expression()
    }
}

fn apply_replacements(source: &str, replacements: &[Replacement]) -> String {
    if replacements.is_empty() {
        return source.to_string();
    }

    let mut ordered = replacements.to_vec();
    ordered.sort_by(|a, b| b.start.cmp(&a.start));

    let mut output = source.to_string();
    for replacement in ordered {
        output = replace_char_range(
            &output,
            replacement.start,
            replacement.end,
            &replacement.text,
        );
    }
    output
}

/// Replace the char-indexed range `[start, end)` of `source` with `replacement`.
///
/// FEL spans are emitted by [`fel_core::lexer::Lexer`] in **char (Unicode
/// scalar) indices**, not byte offsets. Identifiers, numbers, punctuation,
/// and reference sigils are ASCII per FEL grammar — but string literals and
/// block comments interleaved through the source may contain non-ASCII bytes,
/// so we cannot simply treat the span endpoints as byte offsets.
///
/// Rather than allocate intermediate `String` slices via
/// `chars().skip().take().collect()` (the prior implementation, O(N) per call
/// inside the reverse-sorted-replacement loop in [`apply_replacements`]), we
/// walk `char_indices()` once to translate the two char positions into byte
/// offsets and then slice `&str` directly.
fn replace_char_range(source: &str, start: usize, end: usize, replacement: &str) -> String {
    let (start_byte, end_byte) = char_range_to_byte_range(source, start, end);
    debug_assert!(source.is_char_boundary(start_byte));
    debug_assert!(source.is_char_boundary(end_byte));

    let mut output = String::with_capacity(
        source.len().saturating_sub(end_byte - start_byte) + replacement.len(),
    );
    output.push_str(&source[..start_byte]);
    output.push_str(replacement);
    output.push_str(&source[end_byte..]);
    output
}

/// Return the `n`-th `char` (Unicode scalar) of `source`, or `None` if past end.
///
/// Used to recover the opening quote of a string-literal token whose span is
/// in char indices.
fn nth_char(source: &str, n: usize) -> Option<char> {
    source.chars().nth(n)
}

/// Translate a half-open char range `[start, end)` to byte offsets via one
/// pass through `char_indices()`.
fn char_range_to_byte_range(source: &str, start: usize, end: usize) -> (usize, usize) {
    let mut start_byte = source.len();
    let mut end_byte = source.len();
    for (char_idx, (byte_idx, _)) in source.char_indices().enumerate() {
        if char_idx == start {
            start_byte = byte_idx;
        }
        if char_idx == end {
            end_byte = byte_idx;
            return (start_byte, end_byte);
        }
    }
    (start_byte, end_byte)
}

fn quote_string_literal(value: &str, quote: char) -> String {
    let mut output = String::new();
    output.push(quote);
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '\'' if quote == '\'' => output.push_str("\\'"),
            '"' if quote == '"' => output.push_str("\\\""),
            _ => output.push(ch),
        }
    }
    output.push(quote);
    output
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn rewrite_preserves_comments_spacing_and_quotes() {
        let result = rewrite_fel_source_references(
            "prev( /* keep */ \"members\" , $member.total ) + $foo /* tail */ + @instance('census').name + @current.total + @var_name",
            &RewriteOptions {
                rewrite_field_path: Some(Box::new(|path| match path {
                    "member.total" => Some("household.memberTotal".to_string()),
                    "foo" => Some("bar".to_string()),
                    _ => None,
                })),
                rewrite_current_path: Some(Box::new(|path| {
                    (path == "total").then(|| "summary.total".to_string())
                })),
                rewrite_variable: Some(Box::new(|name| {
                    (name == "var_name").then(|| "renamed_var".to_string())
                })),
                rewrite_instance_name: Some(Box::new(|name| {
                    (name == "census").then(|| "demographics".to_string())
                })),
                rewrite_navigation_target: Some(Box::new(|name, function_name| {
                    (function_name == "prev" && name == "members")
                        .then(|| "householdMembers".to_string())
                })),
            },
        );

        assert_eq!(
            result,
            "prev( /* keep */ \"householdMembers\" , $household.memberTotal ) + $bar /* tail */ + @instance('demographics').name + @current.summary.total + @renamed_var"
        );
    }

    const NO_REWRITES: RewriteOptions = RewriteOptions {
        rewrite_field_path: None,
        rewrite_current_path: None,
        rewrite_variable: None,
        rewrite_instance_name: None,
        rewrite_navigation_target: None,
    };

    #[test]
    fn rewrites_keyed_lookup_source_and_key_in_expressions_and_templates() {
        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| match path {
                "k" => Some("key".to_string()),
                "rows" => Some("lines".to_string()),
                _ => None,
            })),
            ..NO_REWRITES
        };
        for (source, expected) in [
            ("$rows[id = $k].name", "$lines[id = $key].name"),
            ("$rows[id = 1] ?? $k", "$lines[id = 1] ?? $key"),
            (
                "@instance('list').rows[identity.id == $k].name",
                "@instance('list').rows[identity.id == $key].name",
            ),
            (
                "let match = $rows[id = $k in [1]] in match",
                "let match = $lines[id = $key in [1]] in match",
            ),
        ] {
            assert_eq!(rewrite_fel_source_references(source, &options), expected);
        }
        assert_eq!(
            rewrite_message_template("{{$rows[id = $k].name}}", &options),
            "{{$lines[id = $key].name}}"
        );
    }

    #[test]
    fn keyed_lookup_children_are_discoverable_and_renameable() {
        let expression = "$rows[id = $sel].name";
        let targets = crate::collect_fel_rewrite_targets(expression);
        let expected = ["rows", "rows[*].id", "rows[*].name", "sel"]
            .map(String::from)
            .into();
        assert_eq!(targets.field_paths, expected);
        assert_eq!(crate::get_fel_dependencies(expression), expected);

        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| match path {
                "rows[*].id" => Some("rows[*].rowId".into()),
                "rows[*].name" => Some("rows[*].label".into()),
                _ => None,
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            rewrite_fel_source_references(expression, &options),
            "$rows[rowId = $sel].label"
        );
        let key_rename = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| {
                (path == "rows[*].id").then(|| "rows[*].rowId".into())
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            crate::rewrite_fel_references(&parse(expression).unwrap(), &key_rename),
            parse("$rows[rowId = $sel].name").unwrap()
        );
    }

    #[test]
    fn assembly_prefixes_keyed_lookup_field_references() {
        let map = crate::AssemblyFelRewriteMap {
            fragment_root_key: String::new(),
            host_group_key: "host".into(),
            imported_keys: ["rows", "k"].map(String::from).into(),
            key_prefix: "p_".into(),
        };
        assert_eq!(
            crate::rewrite_fel_for_assembly("$rows[id = $k].name", &map),
            "$p_rows[id = $p_k].name"
        );
    }

    #[test]
    fn exact_parser_accepts_fel_corpora() {
        let fel_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../fel-core");
        let mut rejected = Vec::new();
        for corpus in [
            "tests/corpus/fuzz_regression.jsonl",
            "conformance/fel-conformance.jsonl",
        ] {
            let text = std::fs::read_to_string(fel_root.join(corpus)).unwrap();
            for (index, line) in text.lines().enumerate() {
                let row: serde_json::Value = serde_json::from_str(line).unwrap();
                let expression = row["expression"].as_str().unwrap();
                if parse(expression).is_err() {
                    continue;
                }
                let tokens = Lexer::new(expression).tokenize().unwrap();
                let options = NO_REWRITES;
                let mut parser = ExactRewriteParser::new(expression, tokens, &options);
                let result = parser.parse_expression();
                if result.is_err() || !parser.at_eof() {
                    rejected.push(format!(
                        "{corpus}:{}: {expression:?}: {result:?}",
                        index + 1
                    ));
                }
            }
        }
        assert!(rejected.is_empty(), "{}", rejected.join("\n"));
    }

    #[test]
    fn rewrite_message_template_leaves_invalid_segments_untouched() {
        let result = rewrite_message_template(
            "Total {{ $amount /* keep */ }}; invalid {{ $ + }}; current {{ @current.total }}.",
            &RewriteOptions {
                rewrite_field_path: Some(Box::new(|path| {
                    (path == "amount").then(|| "totals.amount".to_string())
                })),
                rewrite_current_path: Some(Box::new(|path| {
                    (path == "total").then(|| "summary.total".to_string())
                })),
                rewrite_variable: None,
                rewrite_instance_name: None,
                rewrite_navigation_target: None,
            },
        );

        assert_eq!(
            result,
            "Total {{ $totals.amount /* keep */ }}; invalid {{ $ + }}; current {{ @current.summary.total }}."
        );
    }
}
