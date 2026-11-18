//! Order dependency vertices and identify the vertices in cycles.

use std::collections::VecDeque;

/// Return dependency-first order, or the vertices that participate in cycles.
///
/// Each input list contains the indices of dependencies of that vertex. Shared
/// projections can supply one input list for several readers.
///
/// # Panics
///
/// Panics when a dependency index is outside the vertex list.
pub fn dependency_order(inputs: &[Vec<usize>]) -> Result<Vec<usize>, Vec<usize>> {
    let mut dependents = vec![Vec::new(); inputs.len()];
    let mut incoming: Vec<_> = inputs.iter().map(Vec::len).collect();
    for (reader, dependencies) in inputs.iter().enumerate() {
        for &input in dependencies {
            dependents[input].push(reader);
        }
    }
    topological_order(&mut incoming, &dependents)
        .ok_or_else(|| cycle_members(inputs, &dependents, &incoming))
}

/// Order dependencies first, leaving unresolved incoming edges on a cycle.
fn topological_order(incoming: &mut [usize], dependents: &[Vec<usize>]) -> Option<Vec<usize>> {
    let mut ready: VecDeque<_> = incoming
        .iter()
        .enumerate()
        .filter_map(|(id, count)| (*count == 0).then_some(id))
        .collect();
    let mut order = Vec::with_capacity(incoming.len());
    while let Some(id) = ready.pop_front() {
        order.push(id);
        for &dependent in &dependents[id] {
            incoming[dependent] -= 1;
            if incoming[dependent] == 0 {
                ready.push_back(dependent);
            }
        }
    }
    (order.len() == incoming.len()).then_some(order)
}

/// Kosaraju's two passes, limited to the portion that could not be ordered.
fn cycle_members(edges: &[Vec<usize>], reverse: &[Vec<usize>], incoming: &[usize]) -> Vec<usize> {
    let mut seen = vec![false; edges.len()];
    let mut finished = Vec::new();
    for root in 0..edges.len() {
        if incoming[root] == 0 || seen[root] {
            continue;
        }
        seen[root] = true;
        let mut stack = vec![(root, edges[root].iter())];
        while let Some((id, children)) = stack.last_mut() {
            if let Some(&next) = children.next() {
                if incoming[next] != 0 && !seen[next] {
                    seen[next] = true;
                    stack.push((next, edges[next].iter()));
                }
            } else {
                finished.push(*id);
                stack.pop();
            }
        }
    }

    seen.fill(false);
    let mut members = Vec::new();
    for id in finished.into_iter().rev() {
        if seen[id] {
            continue;
        }
        let mut component = Vec::new();
        let mut stack = vec![id];
        seen[id] = true;
        while let Some(next) = stack.pop() {
            component.push(next);
            for &neighbor in &reverse[next] {
                if incoming[neighbor] != 0 && !seen[neighbor] {
                    seen[neighbor] = true;
                    stack.push(neighbor);
                }
            }
        }
        if component.len() > 1 || edges[id].contains(&id) {
            members.extend(component);
        }
    }
    members
}
