# JSON Forms Documentation Reference

> **Instructions for LLM/AI agents:** This file contains the complete JSON Forms
> documentation (~3100 lines). **Do not read the entire file at once.** Use the
> table of contents below to find the section you need, then read only that
> section using line offsets.
>
> ## Table of Contents (with line numbers)
>
> | Line  | Section                  |
> |-------|--------------------------|
> | 52    | What is JSON Forms?      |
> | 165   | Getting Started          |
> | 197   | Create a JSON Forms App  |
> | 311   | Custom Renderers         |
> | 543   | Custom Layouts           |
> | 721   | Dynamic Renderers        |
> | 860   | Multiple Forms           |
> | 999   | UI Schema                |
> | 1020  | Controls                 |
> | 1322  | Layouts                  |
> | 1401  | Rules                    |
> | 1494  | Architecture             |
> | 1525  | Renderer Sets            |
> | 1603  | APIs                     |
> | 1629  | React Integration        |
> | 1744  | Angular Integration      |
> | 1757  | Vue Integration          |
> | 1781  | Labels                   |
> | 1921  | i18n                     |
> | 2185  | Multiple Choice          |
> | 2398  | Date and Time Picker     |
> | 2752  | ReadOnly                 |
> | 2913  | Ref Resolving            |
> | 2939  | Validation               |
> | 3029  | JSON Forms Middleware    |
>
> ### How to use
>
> 1. **Find the topic** in the table above.
> 2. **Read only that section** using line offset and limit, e.g. for "Controls"
>    (line 1020) through "Layouts" (line 1322): read from offset 1020 with a
>    limit of 302 lines.
> 3. **Read multiple sections** if your question spans topics, but avoid loading
>    the full file.

---
title: "What is JSON Forms?"
source: "https://jsonforms.io/docs"
---

# What is JSON Forms?

JSON Forms is a declarative framework for efficiently building form-based web UIs.
These UIs are targeted at entering, modifying and viewing data and are usually embedded within an application.

## Why do we need such a framework?[​](#why-do-we-need-such-a-framework "Direct link to Why do we need such a framework?")

Writing HTML templates and Javascript for data binding by hand is hard, especially in applications of reasonable size.
Furthermore, a form is often more than just a collection of input fields and more advanced functionality is required, e.g. validation or conditional visibility.

JSON Forms utilizes the capabilities of JSON and JSON schema and provides a simple and declarative way of describing forms.
Forms are then rendered with a UI library or framework, e.g. [React](/docs/integrations/react) or [Angular](/docs/integrations/angular).

## How does it work?[​](#how-does-it-work "Direct link to How does it work?")

Any UI is defined by using two schemata:

- the **data/JSON schema** defines the underlying data to be shown in the UI (objects, properties, and their types);
- the **UI schema** defines how this data is rendered as a form, e.g. the order of controls, their visibility, and the layout.

Both artifacts are interpreted during runtime by the framework and mapped to respective UI components, which already feature data binding, validation etc.

Let's look at an example: below is given a JSON schema describing a task and an UI schema which defines four controls that are to be arranged in a vertical fashion.
The result of rendering the form with JSON Forms can be seen at the bottom.

Here's the JSON schema, which defines a simple task entity:

```
{  "type":"object",  "properties":{    "name":{      "type":"string"    },    "description":{      "type":"string"    },    "done":{      "type":"boolean"    },    "rating":{      "type":"integer"    }  },  "required":[    "name"  ]}
```

And here's the respective UI schema:

```
{  "type":"VerticalLayout",  "elements":[    {      "type":"Control",      "scope":"#/properties/name"    },    {      "type":"Control",      "scope":"#/properties/description",      "options":{        "multi":true      }    },    {      "type":"Control",      "label":"Rating",      "scope":"#/properties/rating"    },    {      "type":"Control",      "label":"Done?",      "scope":"#/properties/done"    }  ]}
```

The form as rendered by JSON Forms:

- Demo
- Schema
- UI Schema
- Data

Name \*

is a required property

Description

Rating

Done?

schema.json

```
{  "type": "object",  "properties": {    "name": {      "type": "string"    },    "description": {      "type": "string"    },    "done": {      "type": "boolean"    },    "rating": {      "type": "integer"    }  },  "required": [    "name"  ]}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/name"    },    {      "type": "Control",      "scope": "#/properties/description",      "options": {        "multi": true      }    },    {      "type": "Control",      "label": "Rating",      "scope": "#/properties/rating"    },    {      "type": "Control",      "label": "Done?",      "scope": "#/properties/done"    }  ]}
```

```
{}
```

JSON Forms provides default renderers for all data types, however, you can change the way things are rendered by providing custom renderers. An example is given below where we replaced the control for the rating property:

- Demo
- Schema
- UI Schema
- Data

Name \*

is a required property

Description

☆☆☆☆☆

Done?

schema.json

```
{  "type": "object",  "properties": {    "name": {      "type": "string"    },    "description": {      "type": "string"    },    "done": {      "type": "boolean"    },    "rating": {      "type": "integer"    }  },  "required": [    "name"  ]}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/name"    },    {      "type": "Control",      "scope": "#/properties/description",      "options": {        "multi": true      }    },    {      "type": "Control",      "label": "Rating",      "scope": "#/properties/rating"    },    {      "type": "Control",      "label": "Done?",      "scope": "#/properties/done"    }  ]}
```

```
{}
```

If you are interested in learning more about JSON Forms, check out the [Getting started](/docs/getting-started) section.


---

---
title: "Getting Started"
source: "https://jsonforms.io/docs/getting-started"
---

# Getting Started

The easiest way to start is to use our React + Material UI seed app.

1. Clone the [seed](https://github.com/eclipsesource/jsonforms-react-seed) app with `git clone`
2. Install dependencies with:

   ```
   npm ci
   ```
3. Run the app in development mode with:

   ```
   npm run dev
   ```

For more information about the seed app, please see the corresponding README file of the [seed repo](https://github.com/eclipsesource/jsonforms-react-seed).

For a more detailed guide about the usage of JSON Forms, please see [our tutorial](/docs/tutorial).

## Other starters[​](#other-starters "Direct link to Other starters")

We also maintain an [Angular seed](https://github.com/eclipsesource/jsonforms-angular-seed) and a [Vue seed](https://github.com/eclipsesource/jsonforms-vue-seed).


---

---
title: "Create a JSON Forms App"
source: "https://jsonforms.io/docs/tutorial"
---

# Create a JSON Forms App

This section describes how you can integrate JSON Forms into a React app from scratch.
Alternatively you can also clone the [seed app](https://github.com/eclipsesource/jsonforms-react-seed).

1. We'll use [create-react-app](https://github.com/facebookincubator/create-react-app) to scaffold a basic React application which we'll use as a starting point.
   If you didn't install `create-react-app` yet, please do so now before continuing.

Let's now create a basic application with:

```
npx create-react-app my-jsonforms-app
```

If you want to use typescript within your project, use the following command instead:

```
npx create-react-app my-jsonforms-app --template typescript
```

Scaffolding may take a couple of moments.
Once it's finished, switch to your newly created app.

```
cd my-jsonforms-app
```

2. Install JSON Forms and the material renderer set.
   We'll use an example from JSON Forms in order to obtain a JSON schema, a corresponding UI schema and a data instance to be rendered.
   You don't need to install the `@jsonforms/examples` package if you plan to supply your own schema in the following:

```
npm install --save @jsonforms/corenpm install --save @jsonforms/reactnpm install --save @jsonforms/material-renderersnpm install --save @jsonforms/examplesnpm install --save @mui/materialnpm install --save @mui/icons-materialnpm install --save @mui/x-date-pickersnpm install --save @emotion/stylednpm install --save @emotion/react 
```

3. Switch to the `src` directory and open `App.js` (`App.tsx` when using typescript) with an editor of your choice.
   Let's add a couple of imports first:

```
import { person } from '@jsonforms/examples';import {  materialRenderers,  materialCells,} from '@jsonforms/material-renderers';
```

The `person` import is necessary for importing the person example while `@jsonforms/material-renderers` imports the [Material UI](https://material-ui.com) based renderer set and respective cells.

Now let's define the variables that are crucial for JSON Forms to work, that is, `data`, `schema` and `uischema`.
As previously mentioned, we are using the person example from JSON Forms here:

```
const schema = person.schema;const uischema = person.uischema;const initialData = person.data;
```

These variables are defined as follows:

- Demo
- Schema
- UI Schema
- Data

Name

Age \*

Birth Date

1985-06-02

###### Additional Information

Height \*

is a required property

is a required property

Occupation \*

is a required property

schema.json

```
{  "type": "object",  "properties": {    "name": {      "type": "string",      "minLength": 3,      "description": "Please enter your name"    },    "vegetarian": {      "type": "boolean"    },    "birthDate": {      "type": "string",      "format": "date"    },    "nationality": {      "type": "string",      "enum": [        "DE",        "IT",        "JP",        "US",        "RU",        "Other"      ]    },    "personalData": {      "type": "object",      "properties": {        "age": {          "type": "integer",          "description": "Please enter your age."        },        "height": {          "type": "number"        },        "drivingSkill": {          "type": "number",          "maximum": 10,          "minimum": 1,          "default": 7        }      },      "required": [        "age",        "height"      ]    },    "occupation": {      "type": "string"    },    "postalCode": {      "type": "string",      "maxLength": 5    }  },  "required": [    "occupation",    "nationality"  ]}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/name"        },        {          "type": "Control",          "scope": "#/properties/personalData/properties/age"        },        {          "type": "Control",          "scope": "#/properties/birthDate"        }      ]    },    {      "type": "Label",      "text": "Additional Information"    },    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/personalData/properties/height"        },        {          "type": "Control",          "scope": "#/properties/nationality"        },        {          "type": "Control",          "scope": "#/properties/occupation",          "options": {            "suggestion": [              "Accountant",              "Engineer",              "Freelancer",              "Journalism",              "Physician",              "Student",              "Teacher",              "Other"            ]          }        }      ]    }  ]}
```

```
{  "name": "John Doe",  "vegetarian": false,  "birthDate": "1985-06-02",  "personalData": {    "age": 34  },  "postalCode": "12345"}
```

4. Now import the `JsonForms` component from `@jsonforms/react`.
   Delete the `header` element and replace it with the `JsonForms` element to get a form rendered:

```
import React, { useState } from 'react';import { JsonForms } from '@jsonforms/react';function App() {  const [data, setData] = useState(initialData);  return (    <div className='App'>      <JsonForms        schema={schema}        uischema={uischema}        data={data}        renderers={materialRenderers}        cells={materialCells}        onChange={({ data, errors }) => setData(data)}      />    </div>  );}
```

The optional `onChange` handler demonstrates how you can listen to data and validation changes in JSON Forms.

5. Now you have a basic form up and running!
   Take a look at our [seed app](https://github.com/eclipsesource/jsonforms-react-seed) for more examples.


---

---
title: "Custom Renderers"
source: "https://jsonforms.io/docs/tutorial/custom-renderers"
---

# Custom Renderers

The default renderers of JSON Forms are a good fit for most scenarios, but there might be certain situations where you'd want to customize the rendered UI Schema elements.
JSON Forms allows for this by registering a custom renderer that produces a different UI for a given UI Schema element.

In this section you will learn how to create and register a custom renderer for a control.
We will replace the default renderer for integer values of a rating property.

Note

While the high level concepts are the same, there are large implementation differences between the offered React, Angular and Vue renderer sets.
This tutorial describes how to add custom renderers for React-based renderer sets.

By default an integer property is rendered like this:

- Demo
- Schema
- UI Schema
- Data

Rating

schema.json

```
{  "type": "object",  "properties": {    "rating": {      "type": "integer",      "minimum": 0,      "maximum": 5    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/rating"}
```

```
{  "rating": 2}
```

Our goal is to replace the default renderer with a custom one which will render the UI for rating as depicted below:

- Demo
- Schema
- UI Schema
- Data

★★☆☆☆

schema.json

```
{  "type": "object",  "properties": {    "rating": {      "type": "integer",      "minimum": 0,      "maximum": 5    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/rating"}
```

```
{  "rating": 2}
```

## Running the seed[​](#running-the-seed "Direct link to Running the seed")

If you want to follow along with this tutorial, you may want to [clone the seed repository](https://github.com/eclipsesource/jsonforms-react-seed) which basically is just a skeleton application scaffolded by create-react-app and JSON Forms dependencies added.
It showcases how to use the standalone JSON Forms component and the legacy version with a Redux store (deprecated).

```
cd jsonforms-react-seednpm installnpm start
```

Once the dependencies are installed and the local server has been started, navigate to <http://localhost:3000> in order to see the application running.

The seed is described in more detail within the `README.md` file of the [repo](https://github.com/eclipsesource/jsonforms-react-seed), hence we only focus on the most crucial parts of the app in the following.

## Core concepts about rendering[​](#core-concepts-about-rendering "Direct link to Core concepts about rendering")

Before explaining how to contribute a component (which we will refer to as a "custom control") to JSON Forms, we first explain how the basic process of rendering works.

JSON Forms maintains a registry of renderers (which are regular React components in case of the React/Material renderers we use in this tutorial).
When JSON Forms is instructed to render a given UI schema to produce a form, it will start with the root element of the UI Schema and try to find a renderer for this UI Schema element in its registry of renderers.

To find a matching renderer, JSON Forms relies on so-called testers.
Every renderer has a tester associated with its registration, which is a function of a UI schema and a JSON schema returning a number.
The returned number is the priority which expresses if and how well a renderer can actually render the given UI Schema Element (where `NOT_APPLICABLE` aka. `-1` means "not at all").

In order to create and register a renderer, we need to perform the following steps:

1. Create a renderer (a React component)
2. Create a corresponding tester for the renderer
3. Register both the renderer and the tester with the framework

The seed app already contains all of the ingredients necessary to create a custom renderer, which we'll use in the following.

### 1. Create a renderer[​](#1-create-a-renderer "Direct link to 1. Create a renderer")

As mentioned previously, the seed app already features a component which we want to use as a renderer.
It's contained in `src/Rating.tsx` and is a rating control, i.e. it allows to set a value between 0 and 5 by selecting the appropriate number of stars.
We won't go into detail about the control itself, but we should mention that we need to provide an `onClick` property in order to allow specifying a callback which gets called every time the user clicks on a star.
We also need to suppy an initial `value`.

In order to use our React component as a JSON Forms compatible renderer, we can use the `withJsonFormsControlProps` utility function from JSON Forms that will give us all necessary props to render the control.
This will allow us to retrieve the initial value and to emit events updating the respective value when the users clicks on a star.
In this case, the props are `data`, which is the actual data bit to be rendered, `path`, a dot-separated string, which represents the path the data is written to and the `handleChange` handler function which we can use for the `onClick` prop of our `Rating` control.
For the `onClick` prop we pass the `handleChange` handler, which we retrieve via another helper function (HOC) provided by JSON Forms called `withJsonFormsControlProps`.
All the handler actually does is to emit a change with the new value.

The complete code of `src/RatingControl.tsx` looks as follows:

```
import { withJsonFormsControlProps } from '@jsonforms/react';import { Rating } from './Rating';interface RatingControlProps {  data: any;  handleChange(path: string, value: any): void;  path: string;}const RatingControl = ({ data, handleChange, path }: RatingControlProps) => (  <Rating    value={data}    updateValue={(newValue: number) => handleChange(path, newValue)}  />);export default withJsonFormsControlProps(RatingControl);
```

### 2. Create a tester[​](#2-create-a-tester "Direct link to 2. Create a tester")

Now that we have our renderer ready, we need to tell JSON Forms when we want to make use of it.
For that purpose we create a tester that checks if the corresponding UI schema element is a control and whether it is bound to a path that ends with `rating`.
If that is the case, we return a rank of 3.
That is because the default renderer sets provide a rank with a value of 2, hence our tester will need to rank the custom control higher a bit higher, such that it will be picked up for the rating control during rendering.
The `ratingControlTester.js` file contains the respective code as a default export.

```
import { rankWith, scopeEndsWith } from '@jsonforms/core';export default rankWith(  3, //increase rank as needed  scopeEndsWith('rating'));
```

Generally speaking, the testers API is made out of different predicates and functions that allow for composition (e.g. `and` or `or`) such that it is easy to target specific parts of the UI schema and/or JSON schema.

### 3. Register the renderer[​](#3-register-the-renderer "Direct link to 3. Register the renderer")

To register the custom renderer we simply add it to the list of renderers passed to the `JsonForms` component.

```
// list of renderers declared outside the App componentconst renderers = [  ...materialRenderers,  //register custom renderers  { tester: ratingControlTester, renderer: RatingControl },];<JsonForms  // other necessary declarations go here...  renderers={renderers}/>;
```

And that's it!
It should be noted that in order to create a full-fledged control there's more work left, since we did not cover concepts like validation or visibility.

## Dispatching[​](#dispatching "Direct link to Dispatching")

When writing custom renderers that themselves dispatch to JSON Forms, there are two components that can be used: `ResolvedJsonFormsDispatch` and `JsonFormsDispatch`.
For performance reasons, it is almost always preferable to use the `ResolvedJsonFormsDispatch` component.
In contrast to `ResolvedJsonFormsDispatch`, the `JsonFormsDispatch` component will additionally check and resolve external schema refs, which is almost never needed in a nested component such as a renderer.

## Reusing existing controls[​](#reusing-existing-controls "Direct link to Reusing existing controls")

There are also scenarios where you don't need a full custom renderer but just want to wrap an existing control or slightly modify its props.

Let's say you have a customized JSON Schema in which some `boolean` properties are associated with a `price`.
The price shall be shown in the label of the control.
Also when the price is over a certain amount an additional text shall be shown indicating that shipping is free.
For this we would like to reuse the existing JSON Forms `MaterialBooleanControl`.

The JSON Forms React Material renderer set exposes its renderers in two ways, a "connected" variant which is used during dispatching and the pure "unwrapped" version.
When you simply want to wrap an existing renderer you can use the default exported "connected" variant.
When you want to access the same props as the "unwrapped" version you'll need to use that variant and then connect it yourself.

The following steps are also based on the [seed repository](https://github.com/eclipsesource/jsonforms-react-seed).

### 1. Add the Control to uischema.json[​](#1-add-the-control-to-uischemajson "Direct link to 1. Add the Control to uischema.json")

```
{  "type": "Control",  "scope": "#/properties/include_gift"}
```

### 2. Add the field to schema.json[​](#2-add-the-field-to-schemajson "Direct link to 2. Add the field to schema.json")

```
"include_gift": {  "type": "boolean",  "price": 20}
```

### 3. Create a renderer and tester[​](#3-create-a-renderer-and-tester "Direct link to 3. Create a renderer and tester")

The exported controls from `@jsonforms/material-renderers` are wrapped in [Higher-Order Components (HOC)](https://reactjs.org/docs/higher-order-components.html) to connect them with JSON Forms' internally managed state.
If we were to use those wrapped controls, we would only have the basic props available which are used for dispatching.
This is useful when you don't really care about the renderer's props but would like to wrap it in additional components.

The unwrapped variants are the ones you want to use when you would like to access the same detailed props as the pure renderer.
As we want to access the schema's price attribute as well as modify the calculated label, we'll use the unwrapped renderer.
The unwrapped controls are all exported in an object called Unwrapped in ['@jsonforms/material-renderers'](https://github.com/eclipsesource/jsonforms/blob/master/packages/material-renderers/src/controls/index.ts).
We can import that object, and then use destructuring to access a specific Control.

```
import { Unwrapped } from '@jsonforms/material-renderers';const { MaterialBooleanControl } = Unwrapped;
```

To determine which HOC to use, we can look at the [source](https://github.com/eclipsesource/jsonforms/tree/master/packages/material-renderers/src/controls) for the respective control.
Most controls use `withJsonFormsControlProps`, with some exceptions for more specialized controls.
Having determined that, we can export our extended control using the same HOC, so that it maintains compatibility.

```
export default withJsonFormsControlProps(checkBoxWithPriceControl);
```

Since our example also uses an attribute that is not defined in the `JsonSchema` type, TypeScript will complain that Property 'price' does not exist on type 'JsonSchema'.
This can be solved by extending the type with an additional attribute, and then casting the schema that was passed into the control into that extended type.
This is a safe operation as we'll make sure that the renderer is only invoked for schemas which have the `price` attribute.

```
type JsonSchemaWithPrice = JsonSchema & { price: string };const schema = props.schema as JsonSchemaWithPrice;
```

Finally, we can return the original control, with added components around it.
We use the `ControlProps` interface, imported from core, to make sure our props have the correct types.

```
import { ControlProps } from '@jsonforms/core';export const checkBoxWithPriceControl = (props: ControlProps) => {  const schema = props.schema as JsonSchemaWithPrice;  const label = `${props.label} (${schema.price})`;  return (    <Grid container>      <Grid item xs={12}>        <MaterialBooleanControl {...props} label={label} />      </Grid>      {schema.price > 50 && (        <Grid item xs={12}>          <Typography>Shipping is free!</Typography>        </Grid>      )}    </Grid>  );};
```

The complete code of `src/CheckBoxWithPriceControl.tsx`:

```
import {  JsonSchema,  ControlProps,  isBooleanControl,  RankedTester,  rankWith,  schemaMatches,  and,} from '@jsonforms/core';import { withJsonFormsControlProps } from '@jsonforms/react';import { Unwrapped } from '@jsonforms/material-renderers';import { Grid, Typography } from '@mui/material';const { MaterialBooleanControl } = Unwrapped;type JsonSchemaWithPrice = JsonSchema & { price: number };export const checkBoxWithPriceControl = (props: ControlProps) => {  const schema = props.schema as JsonSchemaWithPrice;  const label = `${props.label} (${schema.price})`;  return (    <Grid container>      <Grid item xs={12}>        <MaterialBooleanControl {...props} label={label} />      </Grid>      {schema.price > 50 && (        <Grid item xs={12}>          <Typography>Shipping is free!</Typography>        </Grid>      )}    </Grid>  );};export const checkBoxWithPriceControlTester: RankedTester = rankWith(  3,  and(    isBooleanControl,    schemaMatches((schema) => schema.hasOwnProperty('price'))  ));export default withJsonFormsControlProps(checkBoxWithPriceControl);
```

### 4. Register the renderer and tester in App.tsx[​](#4-register-the-renderer-and-tester-in-apptsx "Direct link to 4. Register the renderer and tester in App.tsx")

Finally, as in the examples above, we need to register our renderers and testers:

```
import CheckBoxWithPriceControl, {  checkBoxWithPriceControlTester,} from './CheckBoxWithPriceControl';const renderers = [  ...materialRenderers,  // register custom renderers  { tester: ratingControlTester, renderer: RatingControl },  {    tester: checkBoxWithPriceControlTester,    renderer: CheckBoxWithPriceControl,  },];
```


---

---
title: "Custom Layouts"
source: "https://jsonforms.io/docs/tutorial/custom-layouts"
---

# Custom Layouts

The default layouts of JSON Forms are a good fit for most scenarios, but there might be certain situations where you'd want to customize the rendered layouts.
JSON Forms allows for this by registering a custom renderer that produces a different UI for a given layout.

In this section you will learn how to create and register a custom renderer for a layout.

Note

While the high level concepts are the same, there are large implementation differences between the offered React, Angular and Vue renderer sets.
This tutorial describes how to add custom renderers for React-based renderer sets.

We will replace the default renderer for groups. By default a group is rendered like this:

- Demo
- Schema
- UI Schema
- Data

My Group!

Name

schema.json

```
{  "type": "object",  "properties": {    "name": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Group",  "label": "My Group!",  "elements": [    {      "type": "Control",      "scope": "#/properties/name"    }  ]}
```

```
{  "name": "John Doe"}
```

Our goal is to instead render the UI for groups as depicted below:

- Demo
- Schema
- UI Schema
- Data

### My Group!

Name

schema.json

```
{  "type": "object",  "properties": {    "name": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Group",  "label": "My Group!",  "elements": [    {      "type": "Control",      "scope": "#/properties/name"    }  ]}
```

```
{  "name": "John Doe"}
```

## Running the seed[​](#running-the-seed "Direct link to Running the seed")

If you want to follow along with this tutorial, you may want to [clone the seed repository](https://github.com/eclipsesource/jsonforms-react-seed) which basically is just a skeleton application scaffolded by create-react-app with the JSON Forms dependencies added.

```
cd jsonforms-react-seednpm installnpm start
```

Once the dependencies are installed and the local server has been started, navigate to <http://localhost:3000> in order to see the application running.

The seed is described in more detail within the `README.md` file of the [repo](https://github.com/eclipsesource/jsonforms-react-seed), hence we only focus on the most crucial parts of the app in the following.

## Core concepts about rendering[​](#core-concepts-about-rendering "Direct link to Core concepts about rendering")

Before explaining how to contribute a component (which will be referred to as "custom layout") to JSON Forms, we first explain how the basic process of rendering works.

JSON Forms maintains a registry of renderers (which are regular React components in case of the React/Material renderers we use in this tutorial).
When JSON Forms is instructed to render a given UI schema to produce a form, it will start with the root element of the UI Schema and try to find a renderer for this UI Schema element in its registry of renderers.

To find a matching renderer, JSON Forms relies on so-called testers.
Every renderer has a tester associated with its registration, which is a function of a UI schema and a JSON schema returning a number.
The returned number is the priority which expresses if and how well a renderer can actually render the given UI Schema Element (where `NOT_APPLICABLE` aka. `-1` means "not at all").

In order to create and register a renderer, we need to perform the following steps:

1. Change UI Schema to contain a group
2. Create a renderer (a React component)
3. Create a corresponding tester for the renderer
4. Register both the renderer and the tester with the framework

The seed app already contains all of the ingredients necessary to create a custom layout, which we'll use in the following.

### 1. Add Group to UI Schema[​](#1-add-group-to-ui-schema "Direct link to 1. Add Group to UI Schema")

The first step is to extend our UI Schema and add a Group to it.
You can find the UISchema in `src\uischema.json`.
We can change the type of the root from `"type": "VerticalLayout",` to `"type": "Group",`.
As a group can have a label we should add it, too: `"label": "My Group!",` .
We can keep everything else unchanged.

### 2. Create a renderer[​](#2-create-a-renderer "Direct link to 2. Create a renderer")

We first need to create a new `src\MyGroup.jsx` file.

Here we can code our component. For our example we create a single Accordion.
In order to render the child elements we reuse the `MaterialLayoutRenderer` which we can import from `@jsonforms/material-renderers`.

In order to use our React component as a JSON Forms compatible renderer, we can make use of the `withJsonFormsLayoutProps` utility function from JSON Forms that will give us all relevant props to render the group and delegate to the layout renderer.
In this case, the props are:
`uischema`, which is the actual uischema element to be rendered
`path`, which is necessary to scope the element
`schema`, which is the JSON Schema
`visible`, which tells us whether the renderer is visible based on rule evaluation
`renderers`, which is the list of all known renderers and will be needed for further rendering

The complete code of `src/MyGroup.jsx` looks as follows:

```
import { MaterialLayoutRenderer } from '@jsonforms/material-renderers';import {  Accordion,  AccordionDetails,  AccordionSummary,  Hidden,  Typography,} from '@mui/material';import ExpandMoreIcon from '@mui/icons-material/ExpandMore';import React from 'react';import { withJsonFormsLayoutProps } from '@jsonforms/react';const MyGroupRenderer = (props) => {  const { uischema, schema, path, visible, renderers } = props;  const layoutProps = {    elements: uischema.elements,    schema: schema,    path: path,    direction: 'column',    visible: visible,    uischema: uischema,    renderers: renderers,  };  return (    <Hidden xsUp={!visible}>      <Accordion>        <AccordionSummary expandIcon={<ExpandMoreIcon />}>          <Typography>{uischema.label}</Typography>        </AccordionSummary>        <AccordionDetails>          <MaterialLayoutRenderer {...layoutProps} />        </AccordionDetails>      </Accordion>    </Hidden>  );};export default withJsonFormsLayoutProps(MyGroupRenderer);
```

### 3. Create a tester[​](#3-create-a-tester "Direct link to 3. Create a tester")

Now that we have our renderer ready, we need to tell JSON Forms when we want to make use of it.
For that purpose we create a tester that checks if the corresponding UI schema element is a group.
If that is the case, we return a rank of `1000`.

Add the following code to `src/MyGroup.jsx`:

```
import { rankWith, uiTypeIs } from '@jsonforms/core';export const myGroupTester = rankWith(1000, uiTypeIs('Group'));
```

Generally speaking, the testers API is made out of different predicates and functions that allow for composition (e.g. `and` or `or`) such that it is easy to target specific parts of the UI schema and/or JSON schema.

### 4. Register the renderer[​](#4-register-the-renderer "Direct link to 4. Register the renderer")

All that's left to do is to use the renderer with its tester. We can do so by appending the renderer/tester pair to the array of renderer registrations used by the `JsonForms` component.
Within `App.tsx`, find the list of renderers used by the standalone `JsonForms` component and add the renderer and its tester like so:

```
import MyGroupRenderer, { myGroupTester } from './MyGroup';// list of renderers declared outside the App componentconst renderers = [  ...materialRenderers,  //register custom renderers  { tester: myGroupTester, renderer: MyGroupRenderer },];
```

Then, by simply passing the list of renderers to JSON Forms, our custom layout renderer will be picked up for the Group ui element.

```
<JsonForms  // other necessary declarations go here...  renderers={renderers}/>
```

And that's it! The MyGroup renderer will now be used to render the `Group` element.

## Dispatching[​](#dispatching "Direct link to Dispatching")

When writing custom renderers that themselves dispatch to JSON Forms, there are two components that can be used: `ResolvedJsonFormsDispatch` and `JsonFormsDispatch`.
For performance reasons, it is almost always preferable to use the `ResolvedJsonFormsDispatch` component.
In contrast to `ResolvedJsonFormsDispatch`, the `JsonFormsDispatch` component will additionally check and resolve external schema refs, which is almost never needed in a nested component such as a renderer.

Simple example renderer using dispatching:

```
const MyLayoutRenderer = ({  schema,  uischema,  path,  renderers,  cells,  enabled,  visible,}) => {  return (    <div>      {visible &&        uischema.elements.map((child, index) => (          <ResolvedJsonFormsDispatch            schema={schema}            uischema={child}            path={path}            enabled={enabled}            renderers={renderers}            cells={cells}            key={index}          />        ))}    </div>  );};export default withJsonFormsLayoutProps(MyLayoutRenderer);
```


---

---
title: "Dynamic Renderers"
source: "https://jsonforms.io/docs/tutorial/dynamic-enum"
---

# Dynamic Renderers

In this tutorial, you will learn how to handle dynamic data in React using [custom renderers](/docs/tutorial/custom-renderers), React Context, and the `useJsonForms` hook.
This approach allows you to build flexible and interactive forms that adapt to user selections and API responses.

### Scenario[​](#scenario "Direct link to Scenario")

Imagine a form where users need to provide their location by selecting a country, a region and a city.
The options for countries and regions are fetched from an API.
The available regions depend on the selected country.
To address those requirements, we'll create custom renderers for country and region.

- Demo
- Schema
- UI Schema
- Data

City

schema.json

```
{  "x-url": "www.api.com",  "type": "object",  "properties": {    "country": {      "type": "string",      "x-endpoint": "countries",      "x-dependent": [        "region",        "city"      ]    },    "region": {      "type": "string",      "x-endpoint": "regions",      "x-dependent": [        "city"      ]    },    "city": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "HorizontalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/country"    },    {      "type": "Control",      "scope": "#/properties/region"    },    {      "type": "Control",      "scope": "#/properties/city"    }  ]}
```

```
{}
```

#### Schema[​](#schema "Direct link to Schema")

To begin, let's introduce the corresponding JSON schema.
We have created an object with properties for country, region, and city.
In our example, the schema also includes a property `x-url`, which specifies the entry point of the corresponding API.
Both `country` and `region` have a property `x-endpoint`, indicating the endpoint from which the data should be fetched.
Additionally, they have a field specifying which fields depend on the input.
In the case of the `country` field, the `region` and `city` fields depend on it and will get reset, if the value of the `country` changes.
The `city` field, in turn, is dependent on the `region` field.

```
{  "type": "object",  "x-url": "www.api.com",  "properties": {    "country": {      "type": "string",      "x-endpoint": "countries",      "x-dependents": ["region", "city"]    },    "region": {      "type": "string",      "x-endpoint": "regions",      "x-dependents": ["city"]    },    "city": {      "type": "string"    }  }}
```

### Accessing Schema Data and Initializing the React Context[​](#accessing-schema-data-and-initializing-the-react-context "Direct link to Accessing Schema Data and Initializing the React Context")

In this step we will access the data from the schema and initialize the React context.

#### Accessing the API URL from Schema[​](#accessing-the-api-url-from-schema "Direct link to Accessing the API URL from Schema")

To access the URL defined from the schema we can simply access the `x-url` attribute.

```
const url = schema['x-url'];
```

#### Initializing the React Context[​](#initializing-the-react-context "Direct link to Initializing the React Context")

Now that we have access to the API URL, we can use React Context to make this data available across our renderers.
[React Context](https://react.dev/learn/passing-data-deeply-with-context) lets you share values across the component tree without having to pass props down manually at every level.
To set up the React Context for your API service, create it in your application as follows:

```
export const APIContext = React.createContext(new API(url));const App = () => {  ...  <JsonForms/>}
```

#### Accessing the API context[​](#accessing-the-api-context "Direct link to Accessing the API context")

Access the API service using the context:

```
const api = React.useContext(APIContext);
```

Changing the context's value will trigger a re-render of components that use it.

### The Country Renderer[​](#the-country-renderer "Direct link to The Country Renderer")

The core of the country renderer is a dropdown. Therefore, we can reuse the MaterialEnumControl from the React Material renderer set.
To reuse material renderers, the Unwrapped renderers must be used. (more information regarding reusing renderers can be seen [here](/docs/tutorial/custom-renderers#reusing-existing-controls))

```
import { Unwrapped, WithOptionLabel } from '@jsonforms/material-renderers';const { MaterialEnumControl } = Unwrapped;...<MaterialEnumControl  {...props}  options = {options}  handleChange = {handleChange}/>...
```

With the `MaterialEnumControl`in place the main question remains how to set the `options` and the `handleChange` attribute.
To determine the available options, we need to access the API.
And to implement the `handleChange` function, we need access to the `x-dependents` field in the schema.

#### Accessing Schema Data[​](#accessing-schema-data "Direct link to Accessing Schema Data")

The `x-endpoint` and `x-dependents` fields can be obtained from the schema object provided to the custom renderer via JSON Forms.
Since these fields are not part of the standard JSON schema type in JSON Forms, we must add them to the schema's interface and access them as follows:

```
type JsonSchemaWithDependenciesAndEndpoint = JsonSchema & {  'x-dependent': string[];  'x-endpoint': string;};const CountryControl = (  props: ControlProps & WithOptionLabel & TranslateProps) => {...  const schema = props.schema as JsonSchemaWithDependenciesAndEndpoint;  const endpoint = schema['x-endpoint'];  const dependent = schema['x-dependents'];...}
```

#### Country Renderer Implementation[​](#country-renderer-implementation "Direct link to Country Renderer Implementation")

The country renderer uses the `APIContext` to query the API and fetch the available options.
We utilize the `useEffect` hook to initialize the options.
While waiting for the API response, we set the available options to empty and display a loading spinner.
In the `handleChange` function, we set the new selected value and reset all dependent fields.
When changing the country, both the region and city will be reset to `undefined`.

```
import { Unwrapped, WithOptionLabel } from '@jsonforms/material-renderers';const { MaterialEnumControl } = Unwrapped;type JsonSchemaWithDependenciesAndEndpoint = JsonSchema & {  'x-dependent': string[];  'x-endpoint': string;};const CountryControl = (  props: ControlProps & WithOptionLabel & TranslateProps) => {  const { handleChange } = props;  const [options, setOptions] = useState<string[]>([]);  const api = React.useContext(APIContext);  const schema = props.schema as JsonSchemaDependenciesAndEndpoint;  const endpoint = schema['x-endpoint'];  const dependent: string[] = schema['x-dependents'] ? schema['x-dependents'] : [];  useEffect(() => {    api.get(endpoint).then((result) => {      setOptions(result);    });  }, []);  if (options.length === 0) {    return <CircularProgress />;  }  return (    <MaterialEnumControl      {...props}      handleChange={(path: string, value: any) => {        handleChange(path, value);        dependent.forEach((path) => {          handleChange(path, undefined);        });      }}      options={options.map((option) => {        return { label: option, value: option };      })}    />  );};export default withJsonFormsControlProps(  withTranslateProps(React.memo(CountryControl)),  false);
```

Now all that´s left to do is to [create a tester](/docs/tutorial/custom-renderers#2-create-a-tester) and [register](/docs/tutorial/custom-renderers#3-register-the-renderer) the new custom renderer in our application.

### The Region Renderer[​](#the-region-renderer "Direct link to The Region Renderer")

The region renderer can be implemented similarly to the country renderer.
It also accesses the API via the context and includes `x-endpoint` and `x-dependents` fields defined in its schema.
However, the options, on the other hand, are also dependent on the selected country.
JSON Forms provides the `useJsonForms` hook, enabling you to access form data and trigger component rerenders on data changes.
Let's use this hook in our region renderer to access the selected country:

```
import { Unwrapped, WithOptionLabel } from '@jsonforms/material-renderers';const { MaterialEnumControl } = Unwrapped;type JsonSchemaWithDependenciesAndEndpoint = JsonSchema & {  dependent: string[];  endpoint: string;};const RegionControl = (  props: ControlProps & WithOptionLabel & TranslateProps) => {  const schema = props.schema as JsonSchemaWithDependenciesAndEndpoint;  const { handleChange } = props;  const [options, setOptions] = useState<string[]>([]);  const api = React.useContext(APIContext);  const country = useJsonForms().core?.data.country;  const [previousCountry, setPreviousCountry] = useState<String>();  const endpoint = schema['x-endpoint'];  const dependent: string[] = schema['x-dependents'] ? schema['x-dependents'] : [];  if (previousCountry !== country) {    setOptions([]);    setPreviousCountry(country);    api.get(endpoint + '/' + country).then((result) => {      setOptions(result);    });  }  if (options.length === 0 && country !== undefined) {    return <CircularProgress />;  }  return (    <MaterialEnumControl      {...props}      handleChange={(path: string, value: any) => {        handleChange(path, value);        dependent.forEach((path) => {          handleChange(path, undefined);        });      }}      options={options.map((option) => {        return { label: option, value: option };      })}    />  );};export default withJsonFormsControlProps(  withTranslateProps(React.memo(RegionControl)),  false);
```

Again we need to create a [create a tester](/docs/tutorial/custom-renderers#2-create-a-tester) and [register](/docs/tutorial/custom-renderers#3-register-the-renderer) the new custom renderer.


---

---
title: "Multiple Forms"
source: "https://jsonforms.io/docs/tutorial/multiple-forms"
---

# Multiple Forms

There are use cases where multiple forms should be embedded into a single page.
This section describes some of these in more detail.

## Interlinked inputs[​](#interlinked-inputs "Direct link to Interlinked inputs")

Withing the same form, inputs can be interlinked and interact with each other by using `$ref` and setting the `scope` property within the UI schema accordingly.
In the example below, the schema contains two entities, Person and Address. Each of them is rendered in their own group.
Whenever we change the `shippingAddress` property of the person, it is subsequently updated in the address form and vice versa.

- Demo
- Schema
- UI Schema
- Data

Person

First Name \*

Last Name \*

Age

Address

Street

City

Zip Code

schema.json

```
{  "type": "object",  "properties": {    "person": {      "title": "Person",      "type": "object",      "properties": {        "firstName": {          "type": "string"        },        "lastName": {          "type": "string"        },        "age": {          "description": "Age in years",          "type": "integer",          "minimum": 0        },        "shippingAddress": {          "$ref": "#/properties/address/properties/addressId"        }      },      "required": [        "firstName",        "lastName"      ]    },    "address": {      "title": "Order",      "type": "object",      "properties": {        "addressId": {          "type": "string",          "label": "Address Type",          "enum": [            "Home Address 1",            "Home Address 2",            "Workplace"          ]        },        "street": {          "type": "string"        },        "city": {          "type": "string"        },        "zipCode": {          "type": "string"        }      }    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Group",      "label": "Person",      "elements": [        {          "type": "HorizontalLayout",          "elements": [            {              "type": "Control",              "scope": "#/properties/person/properties/firstName"            },            {              "type": "Control",              "scope": "#/properties/person/properties/lastName"            }          ]        },        {          "type": "HorizontalLayout",          "elements": [            {              "type": "Control",              "scope": "#/properties/person/properties/age"            },            {              "type": "Control",              "label": "Address",              "scope": "#/properties/person/properties/shippingAddress"            }          ]        }      ]    },    {      "type": "Group",      "label": "Address",      "elements": [        {          "type": "HorizontalLayout",          "elements": [            {              "type": "Control",              "scope": "#/properties/person/properties/shippingAddress"            },            {              "type": "Control",              "scope": "#/properties/address/properties/street"            }          ]        },        {          "type": "HorizontalLayout",          "elements": [            {              "type": "Control",              "scope": "#/properties/address/properties/city"            },            {              "type": "Control",              "scope": "#/properties/address/properties/zipCode"            }          ]        }      ]    }  ]}
```

```
{}
```

The code for the example above looks as follows:

```
const schema = {  type: 'object',  properties: {    person: {      title: 'Person',      type: 'object',      properties: {        firstName: {          type: 'string',        },        lastName: {          type: 'string',        },        age: {          description: 'Age in years',          type: 'integer',          minimum: 0,        },        shippingAddress: {          $ref: '#/properties/address/properties/addressId',        },      },      required: ['firstName', 'lastName'],    },    address: {      title: 'Order',      type: 'object',      properties: {        addressId: {          type: 'string',          label: 'Address Type',          enum: ['Home Address 1', 'Home Address 2', 'Workplace'],        },        street: {          type: 'string',        },        city: {          type: 'string',        },        zipCode: {          type: 'string',        },      },    },  },};const uischema = {  type: 'VerticalLayout',  elements: [    {      type: 'Group',      label: 'Person',      elements: [        {          type: 'HorizontalLayout',          elements: [            {              type: 'Control',              scope: '#/properties/person/properties/firstName',            },            {              type: 'Control',              scope: '#/properties/person/properties/lastName',            },          ],        },        {          type: 'HorizontalLayout',          elements: [            {              type: 'Control',              scope: '#/properties/person/properties/age',            },            {              type: 'Control',              label: 'Address',              scope: '#/properties/person/properties/shippingAddress',            },          ],        },      ],    },    {      type: 'Group',      label: 'Address',      elements: [        {          type: 'HorizontalLayout',          elements: [            {              type: 'Control',              scope: '#/properties/person/properties/shippingAddress',            },            {              type: 'Control',              scope: '#/properties/address/properties/street',            },          ],        },        {          type: 'HorizontalLayout',          elements: [            {              type: 'Control',              scope: '#/properties/address/properties/city',            },            {              type: 'Control',              scope: '#/properties/address/properties/zipCode',            },          ],        },      ],    },  ],};const InterLinkedForms = () => {  const [data, setData] = useState({});  return (    <JsonForms      data={data}      onChange={({ errors, data }) => setData(data)}      schema={schema}      uischema={uischema}      renderers={materialRenderers}    />  );};
```

## Independent forms[​](#independent-forms "Direct link to Independent forms")

There might be use cases where you have forms that do not have anything in common, so your forms are independent.
In such cases you use different `JsonForms` components and pass the necessary props to each of them.

To illustrate, let's look again at the example from before, but this time the `person` and `address` schemas are not stored in any common parent schema.

- Demo
- Schema
- UI Schema
- Data

Person

First Name \*

is a required property

Last Name \*

is a required property

Age

Shipping Address

schema.json

```
{  "title": "Person",  "type": "object",  "properties": {    "firstName": {      "type": "string"    },    "lastName": {      "type": "string"    },    "age": {      "description": "Age in years",      "type": "integer",      "minimum": 0    },    "shippingAddress": {      "type": "string"    }  },  "required": [    "firstName",    "lastName"  ]}
```

uischema.json

```
{  "type": "Group",  "label": "Person",  "elements": [    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/firstName"        },        {          "type": "Control",          "scope": "#/properties/lastName"        }      ]    },    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/age"        },        {          "type": "Control",          "scope": "#/properties/shippingAddress"        }      ]    }  ]}
```

```
{}
```

- Demo
- Schema
- UI Schema
- Data

Address

Street

City

Zip Code

schema.json

```
{  "title": "Order",  "type": "object",  "properties": {    "addressId": {      "type": "string",      "label": "Address Type",      "enum": [        "Home Address 1",        "Home Address 2",        "Workplace"      ]    },    "street": {      "type": "string"    },    "city": {      "type": "string"    },    "zipCode": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Group",  "label": "Address",  "elements": [    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/addressId"        },        {          "type": "Control",          "scope": "#/properties/street"        }      ]    },    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/city"        },        {          "type": "Control",          "scope": "#/properties/zipCode"        }      ]    }  ]}
```

```
{}
```

The code for the above example looks as follows:

```
const schema = ... //see aboveconst personSchema = schema.person;const personUISchema = {  type: 'Group',  label: 'Person',  elements: [    {      type: 'HorizontalLayout',      elements: [        {          type: 'Control',          scope: '#/properties/firstName',        },        {          type: 'Control',          scope: '#/properties/lastName',        },      ],    },    {      type: 'HorizontalLayout',      elements: [        {          type: 'Control',          scope: '#/properties/age',        },        {          type: 'Control',          label: 'Address',          scope: '#/properties/shippingAddress',        },      ],    },  ],};const addressSchema = schema.address;const addressUISchema = {      type: 'Group',      label: 'Address',      elements: [        {          type: 'HorizontalLayout',          elements: [            {              type: 'Control',              scope: '#/properties/addressId',            },            {              type: 'Control',              scope: '#/properties/street',            },          ],        },        {          type: 'HorizontalLayout',          elements: [            {              type: 'Control',              scope: '#/properties/city',            },            {              type: 'Control',              scope: '#/properties/zipCode',            },          ],        },      ],    };const IndependentForms = () => {  const [person, setPerson] = useState({});  const [address, setAddress] = useState({});    return (    <div>      <JsonForms        data={person}        onChange={({ errors, data }) => setPerson(data)}        schema={personSchema}        uischema={personUISchema}        renderers={materialRenderers}      />      <JsonForms        data={address}        onChange={({ errors, data }) => setAddress(data)}        schema={addressSchema}        uischema={addressUISchema}        renderers={materialRenderers}      />    </div>  );};
```


---

---
title: "UI Schema"
source: "https://jsonforms.io/docs/uischema"
---

# UI Schema

The UI schema, which is passed to JSON Forms, describes the general layout of a form and is just a regular JSON object.
It describes the form by means of different UI schema elements, which can often be categorized into either Controls or Layouts.

Some UI schema elements allow an `options` property which allows for further configuration of the rendering result. The actual configuration options are often renderer specific and hence need to be looked up.

## Available elements[​](#available-elements "Direct link to Available elements")

- [Controls](/docs/uischema/controls)
- [Layouts](/docs/uischema/layouts)
- [Rules](/docs/uischema/rules)


---

---
title: "Controls"
source: "https://jsonforms.io/docs/uischema/controls"
---

# Controls

Controls represent the basic building blocks for creating forms.

A control is usually displaying the value of one property from the data in an UI element such as an input field.
How a control is rendered depends on the type of the property as defined in the JSON Schema, e.g. a property of type `boolean` is rendered as a Checkbox by default.

## `scope (string)`[​](#scope-string "Direct link to scope-string")

The mandatory `scope` property, which expects a [JSON schema reference value](https://spacetelescope.github.io/understanding-json-schema/structuring.html#reuse%22), defines to which property of the data the control should be bound to.

For instance, let's suppose we want to create a control for the `name` property in this schema:

```
{  "properties": {    "name": {      "type": "string"    }  }}
```

The corresponding UI Schema needs to set the type of the UI Schema Element to `Control` and set the scope to point to the name property from the JSON schema as follows:

```
{  "type": "Control",  "scope": "#/properties/name"}
```

JSON Forms will render the following form from this UI Schema:

- Demo
- Schema
- UI Schema
- Data

Name

schema.json

```
{  "properties": {    "name": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/name"}
```

```
{  "name": "Ottgar"}
```

JSON Forms ships with a default renderer set which consists of renderers for all primitive types as well as for arrays.
Furthermore JSON Forms allows controls to be replaced or new controls to be added for newly invented UI Schema Elements.
For documentation on these so called **Custom Renderers** please see the section about [Custom Renderers](/docs/tutorial/custom-renderers).

## `label (string | boolean)`[​](#label-string--boolean "Direct link to label-string--boolean")

By default, controls use the name of property they point to as a label.
You can customize this behaviour by specifying a `label` property:

```
{  "type": "Control",  "scope": "#/properties/name",  "label": "First name"}
```

Here's the rendered form:

- Demo
- Schema
- UI Schema
- Data

First name

schema.json

```
{  "properties": {    "name": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/name",  "label": "First name"}
```

```
{  "name": "Ottgar"}
```

You can also completely disable the label by setting it to `false`.

## Options[​](#options "Direct link to Options")

Controls can have an optional attribute `options` specifying how the control shall be rendered.
Among the default renderers that support customization via the `options` attribute are the array and enum renderers.

### The `detail` option[​](#the-detail-option "Direct link to the-detail-option")

When using the `detail` option, the items in the array will have a detail view.
The `detail` element can have one of the values:

**`DEFAULT`**

```
options: {  detail : 'DEFAULT'}
```

The array will be rendered as before. The string is case insensitive.

**`GENERATED`**

```
options: {  detail : 'GENERATED'}
```

The array will be rendered using the nested array renderer.
The nested renderer will use a generated UI Schema to render the array elements.
The string is case insensitive.

**`REGISTERED`**

```
options: {  detail : 'REGISTERED'}
```

The array will be rendered using the nested array renderer.
The nested renderer will check if a UI Schema was registered for the type to be rendered or generate one itself.
This case will be triggered if `detail` is any string besides `GENERATED` (case insensitive) or `DEFAULT` (case insensitive).

**`Inlined UI schema`**

```
options: {  detail : {    type: 'HorizontalLayout',    ...  }}
```

The array will be rendered using the nested array renderer.
The nested renderer will use the specified UI Schema to render the array elements.

### Sorting buttons (`showSortButtons`)[​](#sorting-buttons-showsortbuttons "Direct link to sorting-buttons-showsortbuttons")

```
options: {  showSortButtons: true}
```

The `showSortButtons` option is used to toggle additional buttons that allow changing the order of elements within an array.

- Demo
- Schema
- UI Schema
- Data

| Comments | |  |
| --- | --- | --- |
| Name | Message |  |
|  |  |  |
|  |  |  |

schema.json

```
{  "properties": {    "comments": {      "type": "array",      "items": {        "type": "object",        "properties": {          "name": {            "type": "string"          },          "message": {            "type": "string"          }        }      }    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/comments",      "options": {        "showSortButtons": true      }    }  ]}
```

```
{  "comments": [    {      "name": "John Doe",      "message": "This is an example message"    },    {      "name": "Max Mustermann",      "message": "Get ready for booohay"    }  ]}
```

### Label for array elements (`elementLabelProp`)[​](#label-for-array-elements-elementlabelprop "Direct link to label-for-array-elements-elementlabelprop")

```
options: {  elementLabelProp: "propertyName"}
```

The `elementLabelProp` option allows to set a property to serve as a label for each array item.
This option can be provided as a string or an array. More information can be found here:
<https://lodash.com/docs/4.17.15#get>

By default the first primitive (string, number, integer) element will be used.

In the following example each element will be labeled with its name instead of its message because we provide the name prop.

- Demo
- Schema
- UI Schema
- Data

###### Comments

### 1 John Doe

Message

Name

### 2 Max Mustermann

Message

Name

schema.json

```
{  "properties": {    "comments": {      "type": "array",      "title": "Comments",      "items": {        "type": "object",        "properties": {          "message": {            "type": "string"          },          "name": {            "type": "string"          }        }      }    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/comments",      "options": {        "elementLabelProp": "name",        "detail": {          "type": "VerticalLayout",          "elements": [            {              "type": "Control",              "scope": "#/properties/message"            },            {              "type": "Control",              "scope": "#/properties/name"            }          ]        }      }    }  ]}
```

```
{  "comments": [    {      "name": "John Doe",      "message": "This is an example message"    },    {      "name": "Max Mustermann",      "message": "Another message"    }  ]}
```

### Radio groups (`format: 'radio'`)[​](#radio-groups-format-radio "Direct link to radio-groups-format-radio")

```
options: {  format: 'radio'}
```

Use the `format: 'radio'` option to display an enum as a radio group.

- Demo
- Schema
- UI Schema
- Data

Example Radio Enum

OneTwoThree

schema.json

```
{  "type": "object",  "properties": {    "exampleRadioEnum": {      "type": "string",      "enum": [        "One",        "Two",        "Three"      ]    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/exampleRadioEnum",  "options": {    "format": "radio"  }}
```

```
{}
```

### The `readonly` option[​](#the-readonly-option "Direct link to the-readonly-option")

```
options: {  readonly: true}
```

When using the `readonly` option, you can disable the control or whole layout. See [example](/docs/readonly#ui-schema-option).

## Theming[​](#theming "Direct link to Theming")

### Customize 'clear input button' background[​](#customize-clear-input-button-background "Direct link to Customize 'clear input button' background")

```
const customizedTheme = createMuiTheme({  jsonforms: { input: { delete: { background: '#f44336' }}}});<ThemeProvider theme={customizedTheme}>  <JsonForms    ...  /></ThemeProvider>
```

The background of the the 'clear input button' (the one you can see when you hover of the input field) is by default your theme's `palette.background.default` color.
If you want to customize the background of this button you can use the custom theme variable `jsonforms.input.delete.background`.

- Demo
- Schema
- UI Schema
- Data

Name

schema.json

```
{  "properties": {    "name": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/name"}
```

```
{  "name": "Ottgar"}
```


---

---
title: "Layouts"
source: "https://jsonforms.io/docs/uischema/layouts"
---

# Layouts

Layout elements in the UI Schema contain other UI Schema elements like controls or other layouts and serve the purpose of defining the layout of those, e.g. a layout could arrange all its contained UI Schema Elements into a horizontal alignment.

## `elements`[​](#elements "Direct link to elements")

All layouts need to declare an `elements` property which contains the children which are to be arranged by the layout.
It is expected to be an array of UI Schema elements, e.g. controls or other layouts.

## `type`[​](#type "Direct link to type")

By default, JSON Forms supports four different kinds of layouts: `VerticalLayout` and `HorizontalLayout`, a slightly modified version of the vertical layout called `Group` as well `Categorization`, which is often used to bundle related data, for instance by means of Tabs.
Those four core layouts are detailed in the following.

## HorizontalLayout[​](#horizontallayout "Direct link to HorizontalLayout")

[API](/api/core/interfaces/horizontallayout.html)

Horizontal layouts use the `HorizontalLayout` type and arranges its contained `elements` in a horizontal fashion.
Each child occupies the same amount of space, i.e. for n children a child occupies 1/n space.

```
{  "type": "HorizontalLayout",  "elements": [    {      "type": "Control",      "label": "Name",      "scope": "#/properties/name"    },    {      "type": "Control",      "label": "Birth Date",      "scope": "#/properties/birthDate"    }  ]}
```

[Demo](/examples/layouts#horizontal-layout)

## VerticalLayout[​](#verticallayout "Direct link to VerticalLayout")

[API](/api/core/interfaces/verticallayout.html)

Vertical Layouts use the `VerticalLayout` type and arranges its `elements` in a vertical fashion, i.e. all elements are placed beneath each other.

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "label": "Name",      "scope": "#/properties/name"    },    {      "type": "Control",      "label": "Birth Date",      "scope": "#/properties/birthDate"    }  ]}
```

[Demo](/examples/layouts#vertical-layout)

## Group[​](#group "Direct link to Group")

[API](/api/core/interfaces/grouplayout.html)

Groups are very similar to `VerticalLayout`s but feature an additional mandatory `label` property
that is used to describe the `elements`.

### `label`[​](#label "Direct link to label")

The label property defines an additional string that is used to describe the elements of the Group.

```
{  "type": "Group",  "label": "My Group",  "elements": [    {      "type": "Control",      "label": "Name",      "scope": "#/properties/name"    },    {      "type": "Control",      "label": "Birth Date",      "scope": "#/properties/birthDate"    }  ]}
```

[Demo](/examples/layouts#group)

## Categorization[​](#categorization "Direct link to Categorization")

[API](/api/core/interfaces/categorization.html)

Categorization uses the `Categorization` type and can only contain `elements` of type `Category`. A `Category` itself acts as a container and has an `elements` of its own as well as a `label` that describes the contained data.
Categorizations are typically used to structure controls with related data, e.g. 'Personal Data' and 'Dietary requirements' as demonstrated in example below.

```
{  "type": "Categorization",  "elements": [    {      "type": "Category",      "label": "Personal Data",      "elements": [        {          "type": "Control",          "scope": "#/properties/firstName"        },        {          "type": "Control",          "scope": "#/properties/lastName"        },        {          "type": "Control",          "scope": "#/properties/age"        },        {          "type": "Control",          "scope": "#/properties/height"        },        {          "type": "Control",          "scope": "#/properties/dateOfBirth"        }      ]    },    {      "type": "Category",      "label": "Dietary requirements",      "elements": [        {          "type": "Control",          "scope": "#/properties/diet"        },        {          "type": "Control",          "scope": "allergicToPeanuts"        }      ]    }  ]}
```

In the example above note how each child within the elements is of type Category.

[Demo](/examples/categorization)


---

---
title: "Rules"
source: "https://jsonforms.io/docs/uischema/rules"
---

# Rules

[API](/api/core/interfaces/rule.html)

Rules allow for dynamic aspects for a form, e.g. by hiding or disabling UI schema elements.

A rule may be attached to any UI schema element and can be defined with the `rule` property which looks like:

```
"rule": {  "effect": "HIDE" | "SHOW" | "ENABLE" | "DISABLE",  "condition": {    "scope": "<UI Schema scope>",    "schema": JSON Schema  }}
```

A rule basically works by first evaluating the `condition` property and in case it evaluates to true, executing the associated `effect`.

## Rule Effect[​](#rule-effect "Direct link to Rule Effect")

The `effect` property determines what should happen to the attached UI schema element once the `condition` is met.
Current effects include:

- `HIDE`: hide the UI schema element
- `SHOW`: show the UI schema element
- `DISABLE`: disable the UI schema element
- `ENABLE`: enable the UI schema element

## Rule Condition[​](#rule-condition "Direct link to Rule Condition")

The rule `condition` object should conform to the [SchemaBasedCondition](/api/core/interfaces/schemabasedcondition.html) interface.

It should contain a `scope` and `schema` property, where the `schema` is a standard JSON schema object.
This means everything that can be specified using JSON schema can be used as a rule condition.

The `schema` is validated against the data specified in the `scope` property.
If the `scope` data matches the `schema` the rule evaluates to true and the rule effect is applied.

If the `scope` resolves to `undefined`, the JSON schema will successfully validate and the condition will be applied.
Optionally, `failWhenUndefined: true` can be specified to fail the condition in case the scope resolves to `undefined`.

## Examples[​](#examples "Direct link to Examples")

Below are some common rule examples.

To match a scope variable to a specific value, "const" can be used:

```
"rule": {  "effect": "HIDE",  "condition": {    "scope": "#/properties/counter",    "schema": { const: 10 }  }}
```

Here, the control is hidden when the `counter` property is equal to `10`.

Similar, to match multiple values, `enum` can be used:

```
"rule": {  "effect": "HIDE",  "condition": {    "scope": "#/properties/name",    "schema": { enum: ["foo", "bar"] }  }}
```

The rule evaluates to true if the `scope` property `name` is either "foo" or "bar".

A rule can be negated using "not":

```
"rule": {  "effect": "SHOW",  "condition": {    "scope": "#/properties/counter",    "schema": { not: { const: 10 } }  }}
```

The following rule evaluates to true if the `counter` property is `1 <= counter < 10`:

```
"rule": {  "effect": "SHOW",  "condition": {    "scope": "#/properties/counter",    "schema": {  minimum: 1, exclusiveMaximum: 10 }  }}
```

This rule evaluates to true if the `counter` property exists *and* is larger than 1.
This is in contrast with the previous rule, which will evaluate to true if the `counter` property is undefined.

```
"rule": {  "effect": "SHOW",  "condition": {    "scope": "#/properties/counter",    "schema": {  minimum: 1 },    "failWhenUndefined": true  }}
```

A rule can even operate on the full form data object and over multiple properties:

```
"rule": {  "effect": "SHOW",  "condition": {    "scope": "#",    "schema": {      "properties": {        "stringArray": { "contains": { "const": "Foo"  }  }      },      "required": ["stringArray", "otherProperty"]    }  }}
```

In this example, the condition is true if the properties "stringArray" and "otherProperty" are set in the form data and the "stringArray" property contains an element "Foo".
Note, that the schema rule in this example looks more like a normal JSON schema as it is commonly used.


---

---
title: "Architecture"
source: "https://jsonforms.io/docs/architecture"
---

# Architecture

![Example banner](/img/architecture.svg)

The basis of JSON Forms is the core module (`@jsonforms/core`) which provides utilities for managing and rendering JSON Schema based forms.
The core package is independent of any UI technology.

We also provide the JSON Forms React (`@jsonforms/react`), JSON Forms Angular (`@jsonforms/angular`) and JSON Forms Vue (`@jsonforms/vue`) modules.
These use the core package to provide specialized bindings for React, Angular and Vue.
This approach is especially useful when developing multiple renderer sets against the same technology (i.e. React) as the core bindings don't need to be reimplemented with each set.

For React we maintain two renderer sets:
The `@jsonforms/material-renderers`, which are based on the popular [Material-UI](https://material-ui.com/) framework and `@jsonforms/vanilla-renderers` which provides pure HTML5 renderers.
For Angular we provide an [Angular Material](https://material.angular.io/) based renderer set (`@jsonforms/angular-material`).
For Vue we provide a HTML5 based renderer set `@jsonforms/vue-vanilla` and a [Vuetify](https://vuetifyjs.com/) based one `@jsonforms/vue-vuetify`.

We put great emphasis on the customizability and extensibility of JSON Forms.
Not only are the existing renderers declaratively configurable, you can also add your own custom renderers or replace existing ones.
Even when you would like to use a different UI framework (e.g. Bootstrap) you can still reuse the JSON Forms core and React, Angular or Vue packages to help you on the way.

In case you would like to use different application framework you can even create the bindings yourself.
In this case you still get use out of JSON Forms via the core package.


---

---
title: "Renderer sets"
source: "https://jsonforms.io/docs/renderer-sets"
---

# Renderer sets

This is an overview of all available renderer sets and which features they support.

## JSON Schema Features

| JSON Schema | Renderer | React Material | Angular Material | React Vanilla | Vue Vanilla | Vue Vuetify |
| --- | --- | --- | --- | --- | --- | --- |
| boolean | Checkbox |  |  |  |  |  |
|  | Toggle |  |  |  |  |  |
| integer | Number |  |  |  |  |  |
|  | Text |  |  |  |  |  |
| String | Text |  |  |  |  |  |
|  | Textarea |  |  |  |  |  |
| Enum | Combo |  |  |  |  |  |
|  | Autocomplete |  |  |  |  |  |
| oneOf (const / title) | Combo |  |  |  |  |  |
|  | Autocomplete |  |  |  |  |  |
| Date format | Date field |  |  |  |  |  |
| Time format | Time field |  |  |  |  |  |
| Datetime format | Datetime field |  |  |  |  |  |
| Object | Vertical grid |  |  |  |  |  |
| Array of primitives | List |  |  |  |  |  |
| Array of objects | Table |  |  |  |  |  |
|  | List |  |  |  |  |  |
|  | List with Detail |  |  |  |  |  |
| Array of enums | Multiple Choice |  |  |  |  |  |
| oneOf | Tabs |  |  |  |  |  |
| allOf | Tabs |  |  |  |  |  |
| anyOf | Tabs |  |  |  |  |  |

## UI Schema Features

| UI Schema | Renderer | React Material | Angular Material | React Vanilla | Vue Vanilla | Vue Vuetify |
| --- | --- | --- | --- | --- | --- | --- |
| Vertical Layout | Vertical Grid |  |  |  |  |  |
| Horizontal Layout | Horizontal Grid |  |  |  |  |  |
| Categorization | Tabs |  |  |  |  |  |
| Group | Group |  |  |  |  |  |
| Label | Text |  |  |  |  |  |

## React Material UI Renderer Set[​](#react-material-ui-renderer-set "Direct link to React Material UI Renderer Set")

The React Material UI Renderer Set is based on [Material UI](https://material-ui.com).

## React Vanilla Renderer Set[​](#react-vanilla-renderer-set "Direct link to React Vanilla Renderer Set")

The React Vanilla Renderer Set is based on plain HTML with a set of custom styles.
For more information and a customization guide, see the [Vanilla Readme](https://github.com/eclipsesource/jsonforms/blob/master/packages/vanilla-renderers/README.md) and [Styles](https://github.com/eclipsesource/jsonforms/blob/master/packages/vanilla-renderers/Styles.md) manual.

## Angular Material UI Renderer Set[​](#angular-material-ui-renderer-set "Direct link to Angular Material UI Renderer Set")

The Angular Material UI Renderer Set is based on [Angular Material](https://material.angular.io/).

## Vue Vanilla Renderer Set[​](#vue-vanilla-renderer-set "Direct link to Vue Vanilla Renderer Set")

The Vue Renderer Set is based on plain HTML with a set of custom styles.
For more information, see the [Vue Vanilla Readme](https://github.com/eclipsesource/jsonforms/blob/master/packages/vue-vanilla/README.md).

## Vue Vuetify Renderer Set[​](#vue-vuetify-renderer-set "Direct link to Vue Vuetify Renderer Set")

The Vue Vuetify Set provides a Vuetify based renderer set for JSON Forms.

Note

Please note that the Vue Vuetify renderer set is in a preview state and has known bugs.
We are happy to accept contributions to improve its quality.

For more information, see the [Vue Vuetify Readme](https://github.com/eclipsesource/jsonforms/blob/master/packages/vue-vuetify/README.md).


---

---
title: "APIs"
source: "https://jsonforms.io/docs/api"
---

# APIs

ATTENTION

Please note that we do not follow SemVer conventions yet, as the the API of the WIP renderer sets is not considered stable.

This section provides links to the API documentation of all available JSON Forms modules.

- [Core](/api/core/index.html)
- [React integration](/api/react/index.html)
- [React-based Material UI renderers](/api/material/index.html)
- [React-based Vanilla renderers](/api/vanilla/index.html)
- [Angular integration](/api/angular/index.html)
- [Angular-based Material renderers](/api/angular-material/index.html)
- [Vue 3 integration](/api/vue/index.html)
- [Vue 3-based Vanilla renderers](/api/vue-vanilla/index.html)
- [Vue 3-based Vuetify renderers](/api/vue-vuetify/index.html)


---

---
title: "React Integration"
source: "https://jsonforms.io/docs/integrations/react"
---

# React Integration

ATTENTION

As of JSON Forms 2.5 the React-Redux variant is deprecated in favor of the JSON Forms "standalone" component.
The standalone component can still be used in combination with Redux like any other React component.
See our [migration guide](https://github.com/eclipsesource/jsonforms/blob/master/MIGRATION.md) for more information.
For the legacy Redux integration, see [here](/docs/deprecated/redux).

The `JsonForms` component takes the following props:

- [`schema`](#schema): The JSON schema that describes the underlying data
- [`uischema`](#uischema): The UI schema that describes how the form should be rendered. If none is provided a default generated layout is used
- [`data`](#data): The data to be rendered
- [`renderers`](#renderers): The renderers that should be used for rendering the form
- [`cells`](#cells): The cells that should be used for rendering the form
- [`onChange`](#onchange): A callback which is called on each data change, containing the updated data and the validation result.
- [`config`](#config): The default options element for all ui schema elements
- [`uischemas`](#uischemas): A list of UI schemas to be used for specific schema elements
- [`readonly`](#readonly): If set to *true*, the component will be rendered in its disabled state.

```
<JsonForms  schema={schema}  uischema={uischema}  data={data}  renderers={materialRenderers}  cells={materialCells}  onChange={({ errors, data }) => setData(data)}/>
```

## `schema`[​](#schema "Direct link to schema")

The schema prop expects a [JSON Schema value](https://json-schema.org/) describing the underlying data for the form.
If the schema is not provided, JSON Forms can generate one for you, as long as a `data` prop is available.
You can see a generated schema example in [our Examples section](/examples/gen-both-schemas).
The generated schema is useful for rapid prototyping, but generally it is preferred to provide your own schema.

An example schema could look like this:

```
const schema = {  type: 'object',  properties: {    name: {      type: 'string',      minLength: 1,    },    description: {      type: 'string',    },    done: {      type: 'boolean',    },    due_date: {      type: 'string',      format: 'date',    },    rating: {      type: 'integer',      maximum: 5,    },    recurrence: {      type: 'string',      enum: ['Never', 'Daily', 'Weekly', 'Monthly'],    },    recurrence_interval: {      type: 'integer',    },  },  required: ['name', 'due_date'],};
```

## `uischema`[​](#uischema "Direct link to uischema")

The `uischema` prop is a JSON describing the layout of the form.
It can contain different UI schema elements, such as layouts and controls as well as rules for dynamically controlling different features of the UI elements based on data.
You can find more information on the different UI elements and rules [here](/docs/uischema).

If no UI schema is provided, JSON Forms will generate one for you.
You can find an example of a generated UI schema in [our Examples section](/examples/gen-uischema).

An example UI schema for the schema defined above could look like this:

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "label": false,      "scope": "#/properties/done"    },    {      "type": "Control",      "scope": "#/properties/name"    },    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/due_date"        },        {          "type": "Control",          "scope": "#/properties/rating"        }      ]    },    {      "type": "Control",      "scope": "#/properties/description",      "options": {        "multi": true      }    },    {      "type": "HorizontalLayout",      "elements": [        {          "type": "Control",          "scope": "#/properties/recurrence"        },        {          "type": "Control",          "scope": "#/properties/recurrence_interval",          "rule": {            "effect": "HIDE",            "condition": {              "scope": "#/properties/recurrence",              "schema": {                "const": "Never"              }            }          }        }      ]    }  ]}
```

## `data`[​](#data "Direct link to data")

The `data` prop represents an object containing the data to be rendered in the form.

The data given to JSON Forms can be updated when necessary, for example when clearing a form:

```
const initialData = {  name: 'Max Power',};const ClearFormExample = () => {  const [data, setData] = useState(initialData);  return (    <div>      <JsonForms        schema={schema}        uischema={uischema}        data={data}        renderers={materialRenderers}        cells={materialCells}        onChange={({ data, _errors }) => setData(data)}      />      <Button onClick={() => setData({})} color='primary'>        Clear form data      </Button>    </div>  );};
```

## `renderers`[​](#renderers "Direct link to renderers")

With the `renderers` prop you can supply the renderers that should be used for rendering the form.
You can choose one of the [renderer sets](/docs/renderer-sets) already provided by JSON Forms or supply [your own renderers](/docs/tutorial/custom-renderers).

## `cells`[​](#cells "Direct link to cells")

Cells are a second renderer set, intended to be used for simpler use cases than `renderers`, i.e. rendering inputs without labels and validation messages.
In the `@jsonforms/material-renderers` they are used for rendering table cells.
In the `@jsonforms/vanilla-renderers` they are used both for rendering table cells as well as the inner content of the regular renderers, i.e. the integer renderer will use an integer cell.

You can use the cell renderers provided by one of the available [renderer sets](/docs/renderer-sets) or supply [your own custom ones](/docs/tutorial/custom-renderers).

## `onChange`[​](#onchange "Direct link to onchange")

A callback which is called on each data change, containing the updated data and the validation result.
JSON Forms will immediately produce an event with the results of the initial validation, even before the inputs of the form are changed.

## `config`[​](#config "Direct link to config")

You can configure some options available for all UI schema elements via the `config` prop:

- `restrict`: *boolean* value specifying whether the number of characters should be restricted to 'maxLength' specified in the JSON schema
- `trim`: *boolean* value indicating whether the control shall grab full width.
- `showUnfocusedDescription`: *boolean* value specifying whether the input descriptions should be shown even when the input is not focused
- `hideRequiredAsterisk`: *boolean* value specifying whether the asterisks shown in labels for required inputs should be hidden

The default config used by JSON Forms looks like this:

```
defaultConfigOptions = { restrict: false, trim: false, showUnfocusedDescription: false, hideRequiredAsterisk: false}
```

When an UI schema element defines one of these properties in their `options` object, it will have a higher precedence.

## `uischemas`[​](#uischemas "Direct link to uischemas")

The `uischemas` prop can be used to register a list of UI schemas and corresponding testers that will be used whenever a 'detail' UI schema shall be rendered (for example in array and object renderers).
This is useful when you need some kind of dynamic dispatching of uischemas.

## `readonly`[​](#readonly "Direct link to readonly")

If set to *true*, all renderers will be instructed to render in a disabled state.


---

---
title: "Angular Integration"
source: "https://jsonforms.io/docs/integrations/angular"
---

# Angular Integration

For examples on how to register custom renderers, custom validation and custom ref resolving please see the JSON Forms Angular seed repository: 
<https://github.com/eclipsesource/jsonforms-angular-seed>


---

---
title: "Vue Integration"
source: "https://jsonforms.io/docs/integrations/vue"
---

# Vue Integration

Note

Currently this integration is in a preview state!

With version 2.5 of JSON Forms we added support for Vue 2 (`@jsonforms/vue2`) and Vue 3 (`@jsonforms/vue`).
Support for Vue 2 was dropped with JSON Forms 3.2.
The last official release containing Vue 2 is [v3.1.0](https://github.com/eclipsesource/jsonforms/tree/v3.1.0).

For Vue we provide a HTML5 based renderer set, `@jsonforms/vue-vanilla` for Vue 3.
There also is the Vuetify-based renderer set `@jsonforms/vue-vuetify`. Note that this is currently in a preview state.
Additionally, we offer a [jsonforms-vue-seed](https://github.com/eclipsesource/jsonforms-vue-seed), which allows to get a quick start with our Vue integration.

For further information on how to use JSON Forms Vue and how to write an own renderer set, please consult the README.md files for the [Vue](https://github.com/eclipsesource/jsonforms/blob/master/packages/vue/README.md) bindings as well as the [Vue vanilla](https://github.com/eclipsesource/jsonforms/blob/master/packages/vue-vanilla/README.md) and the [Vue Vuetify](https://github.com/eclipsesource/jsonforms/blob/master/packages/vue-vuetify/README.md) renderer sets.


---

---
title: "Labels"
source: "https://jsonforms.io/docs/labels"
---

# Labels

Labels are determined by JSON Forms in the following way:

- If an UI Schema `label` is set, it will be used as the label
- If there is no UI Schema `label` **but** a JSON Schema `title`, the JSON Schema `title` will be used as the label
- If there is no UI schema `label` **and** no JSON Schema `title`, the label will be derived from the property name

## UI Schema `label`[​](#ui-schema-label "Direct link to ui-schema-label")

Labels can be specified in UI Schemas via the label attribute.
If both the JSON Schema `title` and the UI Schema `label` are specified, the UI Schema `label` will be used.

```
{  type: "VerticalLayout",  elements: [    {      type: "Control",      scope: "#/properties/name",      label: "First Name"    }  ]}
```

- Demo
- Schema
- UI Schema
- Data

First Name

schema.json

```
{  "properties": {    "name": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/name",      "label": "First Name"    }  ]}
```

```
{}
```

## JSON Schema `title`[​](#json-schema-title "Direct link to json-schema-title")

When no UI Schema `label` is set, JSON Forms will use the JSON Schema `title` annotation.

```
{  properties: {    name: {      type: "string",      title: "First Name"    }  }}
```

- Demo
- Schema
- UI Schema
- Data

First Name

schema.json

```
{  "properties": {    "name": {      "type": "string",      "title": "First Name"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/name"    }  ]}
```

```
{}
```

## Derived by property[​](#derived-by-property "Direct link to Derived by property")

When no `label` in the UI Schema and no `title` in the JSON Schema is provided, JSON Forms will derive the label directly from the property name.
For example if the input name is `firstname`, the label will be `Firstname`.
In order to have a label with multiple separated words, camel case can be used.
So if the input name is `firstName`, the label will be `First Name`.

- Demo
- Schema
- UI Schema
- Data

First Name

schema.json

```
{  "properties": {    "firstName": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/firstName"    }  ]}
```

```
{}
```

## `oneOf` enum titles[​](#oneof-enum-titles "Direct link to oneof-enum-titles")

JSON Schema does not provide a way to specify titles for enum values.
However you can use a `oneOf` construct instead in which each entry specifies a `const` for the enum value and `title` for the enum label.
JSON Forms will recognize this construct and render it in the same way as usual enums.

```
{  properties: {    gender: {      oneOf: [        {          const: "male",          title: "Male"        },        {          const: "female",          title: "Female"        },        {          const: "other",          title: "Diverse"        }      ]    }  }}
```

- Demo
- Schema
- UI Schema
- Data

schema.json

```
{  "properties": {    "gender": {      "oneOf": [        {          "const": "male",          "title": "Male"        },        {          "const": "female",          "title": "Female"        },        {          "const": "other",          "title": "Diverse"        }      ]    }  }}
```

uischema.json

```
{}
```

```
{}
```


---

---
title: "i18n"
source: "https://jsonforms.io/docs/i18n"
---

# i18n

note

Please note that the renderer sets themselves are not yet translatable.
You can find the current status here:
<https://github.com/eclipsesource/jsonforms/issues/1826>

The translate functionality of JSON Forms is integrated into the core component.
In order to translate JSON Forms, you need to set a translation function and provide it to the JSON Forms component:

```
const createTranslator = (locale) => (key, defaultMessage) => {  console.log(`Locale: ${locale}, Key: ${key}, Default Message: ${defaultMessage}`);  return defaultMessage;};const [locale, setLocale] = useState<'de'|'en'>('de');const translation = useMemo(() => createTranslator(locale), [locale]);<JsonForms  i18n={{locale: locale, translate: translation}}  .../>
```

The `i18n` prop consists of three components: `locale`, `translate` and `translateError`.

## `locale`[​](#locale "Direct link to locale")

Specifies the current locale of the application.
This can be used by renderers to render locale specific UI elements, for example for locale-aware formatting of numbers.

## `translate`[​](#translate "Direct link to translate")

Provides a translation function handling the actual translation.

caution

The translate function should be side effect free and should be stable (memoized) to avoid unnecessary re-renderings, i.e. the translate function should only change if there are new translations.

The type of the translate is

```
(key: string, defaultMessage: string | undefined, context: any) => string | undefined)
```

with the following parameters:

### `key`[​](#key "Direct link to key")

The key is used to identify the string that needs to be translated.
It can be set using the `UI Schema`, the `JSON Schema` or is generated by default based on the property path.

#### UI Schema option[​](#ui-schema-option "Direct link to UI Schema option")

The key can be set via the `i18n` UI Schema option:

```
{   "type": "Control",   "label": "name",   "scope": "#/properties/name",   "i18n": "customName" }
```

Therefore, the translation will be invoked with `customName.label` & `customName.description`.

#### JSON Schema[​](#json-schema "Direct link to JSON Schema")

The key can also be set with the custom JSON Schema `i18n` option:

```
{  "name": {     "type": "string",     "i18n": "myCustomName"   }} 
```

Therefore, the translation will be invoked with `myCustomName.label` & `myCustomName.description`.

#### Default: Property path[​](#default-property-path "Direct link to Default: Property path")

If none of the above is set, the property path will be used as the key.

```
{  "properties": {    "firstName": {      "type": "string"    },    "address": {      "type": "object",      "properties": {        "street": {          "type": "string"        }      }    },    "comments": {      "type": "array",      "items": {        "type": "object",        "properties": {          "message": {            "type": "string"          },        }      }    }  }}
```

The paths in the above example are:

- `firstName.label` & `firstName.description`
- `address.label` & `address.description`
- `address.street.label` & `address.street.description`
- `comments.message.label` & `comments.message.description` (the path for arrays will not contain indices)

### `defaultMessage`[​](#defaultmessage "Direct link to defaultmessage")

The default message is provided by JSON Forms and can act as a fallback or could be translated.

note

If the `defaultMessage` is `undefined`, you should also return `undefined` if there is no translation for the given key.
Returning an empty string (or something similar) instead may result in undesired behavior.
JSON Forms will use `undefined` when the message could be skipped or another more generic key could be tried.

### `context`[​](#context "Direct link to context")

`context` can contain additional information for the current translation. The following parameters can be provided:

| Parameter | Description |
| --- | --- |
| errors | Array of AJV errors, that occurred during validation |
| path | The path of the translated element |
| schema | The schema of the translated element |
| uischema | The uischema of the translated element |

Schema translations provide all properties, while UI schema translations only provide the `uischema` property.

## `translateError`[​](#translateerror "Direct link to translateerror")

The `translateError` function is called whenever a single message is to be extracted from an AJV error object.

The type of the `translateError` function is

```
(error: ErrorObject, translate: Translator, uischema?: UISchemaElement) => string
```

- The `error` is the AJV error object
- `translate` is the i18n `translate` function handed over to JSON Forms
- In cases where a UI Schema Element can be correlated to an `error` it will also be handed over
- The `translateError` function always returns a `string`

Usually this method does not need to be customized as JSON Forms already provides a sensible default implementation.
A reason to customize this method could be to integrate third party frameworks like `ajv-i18n`.

For more information about how errors can be customized, see the following section:

## Error Customizations[​](#error-customizations "Direct link to Error Customizations")

For each control a list of errors is determined.
This section describes the default behavior of JSON forms to offer translation support for them.

### `<i18nkey>.error.custom`[​](#i18nkeyerrorcustom "Direct link to i18nkeyerrorcustom")

Before invoking the `translateError` function, JSON Forms will check whether a `<i18nkey>.error.custom` translation exists.
This is useful if there are many JSON Schema validaton keywords defined for a single property, but a single cohesive message shall be displayed.

If no `<i18nkey>.error.custom` message is returned by the `translate` function, `translateError` will be called for each AJV error and the results combined.

The default implementation of `translateError` will invoke `translate` multiple times to determine the best message for the given error. Therefore it's usually not necessary to customize `translateError` itself.
By default error it works like this:

`<i18nkey>` in the sections below refers to the key of the field (see `key` section above).

### Evaluation order[​](#evaluation-order "Direct link to Evaluation order")

#### `<i18nkey>.error.<keyword>`[​](#i18nkeyerrorkeyword "Direct link to i18nkeyerrorkeyword")

Example keys: `name.error.required`, `address.street.error.pattern`

The default `translateError` will first look for a concrete message for a specific field and a specific error type.

#### `error.<keyword>`[​](#errorkeyword "Direct link to errorkeyword")

Example keys: `error.required`, `error.pattern`

After checking field specific translations, `translateError` will then look for form-wide translations of errors, independent of each respective field.
This is useful to customize for example `required` or `pattern` messages for all properties.

#### error message[​](#error-message "Direct link to error message")

At last the default `translateError` implementation will check whether the `message` of the error object has a specific translation.

#### Default AJV error message[​](#default-ajv-error-message "Direct link to Default AJV error message")

If none of the above apply, the `message` provided by the AJV error object will be used.

### Example[​](#example "Direct link to Example")

Consider the following schema for an object attribute:

```
{  phone: {    type: "string",    minLength: 10,    pattern: "^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$"  }}
```

The order in which the error keys are evaluated is the following:

- `phone.error.custom`: if this is set, the `pattern` and `minLength` errors will be ignores and just this message is used
- `phone.error.pattern` & `phone.error.minLength`
- `error.pattern` & `error.minLength`

## Enum translation[​](#enum-translation "Direct link to Enum translation")

Enum translations are based on the respective entries:

- For JSON Schema `enum`, the stringified value is used.
- For JSON Schema `oneOf` enums which consist of (`title`, `const`) pairs a specialized `i18n` key or `title` is used.

Therefore, in order to translate enum values, an additional key is checked for each enum entry.
For example:
Let's assume we have an enum attribute `gender`, which looks like this:

```
{  gender: {    type: "string",    enum: ["male", "female", "other"]  }}
```

In this case the `translate` function will be invoked with the keys `gender.male`, `gender.female` and `gender.other` to translate these enum values. In case `gender` had an `i18n` property, it would be used instead, i.e. `<i18nkey>.male` etc.

Let's assume we have a `oneOf` enum attribute gender which looks like this:

```
{  gender: {    oneOf: [      {        title: "Male",        const: 0      },      {        title: "Female",        const: "f",        i18n: "fem"      },      {        const: null      }    ]  }}
```

Here the requested keys are:

- `gender.Male` - property path + `title` of the `oneOf` entry
- `fem` - direct usage of the `i18n` property for the `oneOf` entry
- `null` - the `title` attribute is missing, therefore the `null` value is stringified to `'null'`.

## UI Schema Translation[​](#ui-schema-translation "Direct link to UI Schema Translation")

The UI schema has the elements `group`, `category` and `label`, which can also be translated.

If a i18n-key is provided in a `group` or `category` element, `<i18n>.label` will be used as key.  
If no i18n key is provided, the value of the `label`-property is used as key.  
In case neither a i18n-key nor a label is provided, `<property-path>.label` will be used as default key.

The `label` UI schema element will use `<i18n>.text` as key, if provided.  
If no i18n key is provided, the value of the `text`-property is used as key.

Let's assume we have the following UI schema:

```
const uischema = {  type: 'VerticalLayout',  elements: [    {      type: 'Control',      scope: '#/properties/user',      options: {        detail: {          type: 'Group',          i18n: 'i18nUser',        }      }    },    {      type: 'Control',      scope: '#/properties/address',      options: {        detail: {          type: 'Group',          label: 'labelAddress',        }      }    },    {      type: 'Control',      scope: '#/properties/address'    },    {      type: 'Label',      i18n: 'i18nLabel'    },    {      type: 'Label',      text: 'textLabel'    },  ]};
```

Here the requested keys are:

- `i18nUser.label` - i18n + `label`
- `labelAddress` - direct usage of the `label` property
- `address.label` - property path + `label`
- `i18nLabel.text` - i18n + `text`
- `textLabel` - direct usage of the `text` property

## Access translation in custom renderer sets[​](#access-translation-in-custom-renderer-sets "Direct link to Access translation in custom renderer sets")

If you want to directly access the i18n properties within a custom renderer, you can use the JSON Forms context for that:

```
const ctx = useJsonForms();const locale = ctx.i18n.locale;const translate = ctx.i18n.translate;const translateError = ctx.i18n.translateError;
```

With this you can for example change phone number patterns based on the current locale for validation.

## Example[​](#example-1 "Direct link to Example")

Vorname

Vorname

Nachname

Nachname

Email \*

Email

Switch language  
Current language: de


---

---
title: "Multiple Choice"
source: "https://jsonforms.io/docs/multiple-choice"
---

# Multiple Choice

JSON Forms supports different multiple-choice options. It is possible to configure a single select, where only one option can be selected, or a multi select, where several options can be selected.

## Single Select[​](#single-select "Direct link to Single Select")

A single select can be achieved by using an `enum` or an `oneOf` in the JSON schema.

### Enum[​](#enum "Direct link to Enum")

You can define an enum in your schema like this:

```
plainEnum: {  type: 'string',  enum: ['foo', 'bar', 'foobar']}
```

- Demo
- Schema
- UI Schema
- Data

schema.json

```
{  "type": "object",  "properties": {    "plainEnum": {      "type": "string",      "enum": [        "foo",        "bar",        "foobar"      ]    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/plainEnum"    }  ]}
```

```
{  "plainEnum": "foo"}
```

### One Of[​](#one-of "Direct link to One Of")

With the use of `oneOf`, you can also add the `title` option. You can define an enum in your schema like this:

```
oneOfEnum: {  type: 'string',  oneOf: [    {      const: 'foo',      title: 'Foo'    },    {      const: 'bar',      title: 'Bar'    },    {      const: 'foobar',      title: 'FooBar'    }  ]}
```

- Demo
- Schema
- UI Schema
- Data

schema.json

```
{  "type": "object",  "properties": {    "oneOfEnum": {      "type": "string",      "oneOf": [        {          "const": "foo",          "title": "Foo"        },        {          "const": "bar",          "title": "Bar"        },        {          "const": "foobar",          "title": "FooBar"        }      ]    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/oneOfEnum"    }  ]}
```

```
{  "oneOfEnum": "foo"}
```

### Radio Button[​](#radio-button "Direct link to Radio Button")

Both `enum` and `oneOf` support the option to use radio buttons instead of a dropdown. You can use them by using the `format` option in the UI Schema:

```
{  type: "Control",  scope: "#/properties/radioGroup",  options: {    format: "radio"  }}
```

- Demo
- Schema
- UI Schema
- Data

Radio Group

foobarfoobar

schema.json

```
{  "type": "object",  "properties": {    "radioGroup": {      "type": "string",      "enum": [        "foo",        "bar",        "foobar"      ]    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/radioGroup",      "options": {        "format": "radio"      }    }  ]}
```

```
{}
```

### Autocomplete Option[​](#autocomplete-option "Direct link to Autocomplete Option")

There is also the option to use the autocomplete renderer.
The autocomplete renderer is available for data of type `enum` and `oneOf` and is rendered by using the `autocomplete` option in the UI schema:

```
{  type: "Control",  scope: "#/properties/autocompleteEnum",  options: {    autocomplete: true  }}
```

- Demo
- Schema
- UI Schema
- Data

schema.json

```
{  "type": "object",  "properties": {    "autocompleteEnum": {      "type": "string",      "enum": [        "foo",        "bar",        "foobar"      ]    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/autocompleteEnum",      "options": {        "autocomplete": true      }    }  ]}
```

```
{}
```

Note: For JSON Forms < 3.0 this renderer is only available in the extended React Material renderer set (`extendedMaterialRenderers`). The renderer set can be imported from `@jsonforms/material-renderers/extended` . This renderer set requires the `@material-ui/lab` peer dependency.

## Multi Select[​](#multi-select "Direct link to Multi Select")

There are again two different ways to define the enum.

### Enum[​](#enum-1 "Direct link to Enum")

JSON forms will render a multi select if you define an Array of `enums` with the `uniqueItems` option set to true in your JSON schema like in the example below.

```
multiEnum: {  type: "array",  uniqueItems: true,  items: {    type: "string",    enum: [      "foo",      "bar",      "foobar"    ]  }}
```

- Demo
- Schema
- UI Schema
- Data

Multi Enum

foobarfoobar

schema.json

```
{  "type": "object",  "properties": {    "multiEnum": {      "type": "array",      "uniqueItems": true,      "items": {        "type": "string",        "enum": [          "foo",          "bar",          "foobar"        ]      }    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/multiEnum"    }  ]}
```

```
{}
```

### One Of[​](#one-of-1 "Direct link to One Of")

JSON forms will render a multi select if you define an Array of `oneOfs` with the `uniqueItems` option set to true in your JSON schema like in the example below.

```
oneOfMultiEnum: {  type: 'array',  uniqueItems: true,  items: {    oneOf: [      { const: 'foo', title: 'My Foo' },      { const: 'bar', title: 'My Bar' },      { const: 'foobar', title: 'My FooBar' }    ]  }}
```

- Demo
- Schema
- UI Schema
- Data

One Of Multi Enum

My FooMy BarMy FooBar

schema.json

```
{  "type": "object",  "properties": {    "oneOfMultiEnum": {      "type": "array",      "uniqueItems": true,      "items": {        "oneOf": [          {            "const": "foo",            "title": "My Foo"          },          {            "const": "bar",            "title": "My Bar"          },          {            "const": "foobar",            "title": "My FooBar"          }        ]      }    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/oneOfMultiEnum"    }  ]}
```

```
{}
```

## Localization[​](#localization "Direct link to Localization")

For how to localize the enum, have a look at our localization guide.


---

---
title: "Date and Time Picker"
source: "https://jsonforms.io/docs/date-time-picker"
---

# Date and Time Picker

JSON Forms supports JSON Schema's "date", "time" and "date-time" formats. Additional options to customize the "date", "time" and "date-time" pickers are offered for the React Material renderer set.

## Time Picker[​](#time-picker "Direct link to Time Picker")

The time picker will be used when `format: "time"` is specified for a string property in the JSON Schema. Alternatively `format: "time"` can also be specified via the UI Schema options.

### Schema Based[​](#schema-based "Direct link to Schema Based")

A control will be rendered as a time picker when the format of the corresponding string property is set to "time" in the JSON Schema.

- Demo
- Schema
- UI Schema
- Data

Time

13:37

schema.json

```
{  "properties": {    "time": {      "type": "string",      "format": "time",      "description": "schema-based time picker"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/time"}
```

```
{  "time": "13:37:00"}
```

### UI Schema Based[​](#ui-schema-based "Direct link to UI Schema Based")

A string control will also be rendered as a time picker by setting the property "format" to "time" in the UI Schema options.

- Demo
- Schema
- UI Schema
- Data

Time

13:37

schema.json

```
{  "properties": {    "time": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/time",  "options": {    "format": "time"  }}
```

```
{  "time": "13:37:00"}
```

### Options[​](#options "Direct link to Options")

The React Material renderer set offers additional UI Schema options to customize the appearance of the time picker text input as well as the picker itself. Please also refer to the localization section of this page to get information on how to customize the locales.

## Time Picker Options

| Option | Description |
| --- | --- |
| timeFormat | The time format used for the text input, can be different from the save format |
| timeSaveFormat | The format in which the time is saved in the data. Note that if you specify a format which is incompatible with JSON Schema's "time" format then you should use the UI Schema based invocation, otherwise the control will be marked with an error. |
| ampm | If set to true, the time picker modal is presented in 12-hour format, otherwise the 24-hour format is used |
| clearLabel | Label of the "clear" action in the time picker modal |
| cancelLabel | Label of the "cancel" action in the time picker modal |
| okLabel | Label of the "confirm" action in the time picker modal |

The following example showcases some of the options.
The text input is configured to only show the full hours while both hours and minutes are saved into the data.
The picker presents itself in `am/pm` format.

- Demo
- Schema
- UI Schema
- Data

Time

13

schema.json

```
{  "properties": {    "time": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/time",  "options": {    "format": "time",    "ampm": true,    "timeFormat": "HH",    "timeSaveFormat": "HH:mm",    "clearLabel": "Clear it!",    "cancelLabel": "Abort",    "okLabel": "Do it"  }}
```

```
{  "time": "13:00:00"}
```

## Date Picker[​](#date-picker "Direct link to Date Picker")

The date picker will be used when `format: "date"` is specified for a string property in the JSON Schema. Alternatively `format: "date"` can also be specified via the UI Schema options.

### Schema Based[​](#schema-based-1 "Direct link to Schema Based")

A control will be rendered as a date picker when the format of the corresponding string property is set to "date" in the JSON Schema.

- Demo
- Schema
- UI Schema
- Data

Date

2026-02-10

schema.json

```
{  "properties": {    "date": {      "type": "string",      "format": "date",      "description": "schema-based date picker"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/date"}
```

```
{  "date": "2026-02-10"}
```

### UI Schema Based[​](#ui-schema-based-1 "Direct link to UI Schema Based")

A string control will also be rendered as a date picker by setting the property "format" to "date" in the UI Schema options.

- Demo
- Schema
- UI Schema
- Data

Date

2026-02-10

schema.json

```
{  "properties": {    "date": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/date",  "options": {    "format": "date"  }}
```

```
{  "date": "2026-02-10"}
```

### Options[​](#options-1 "Direct link to Options")

The React Material renderer set offers additional UI Schema options to customize the appearance of the date picker text input as well as the picker itself. Please also refer to the localization section of this page to get information on how to customize the locales.

## Date Picker Options

| Option | Description |
| --- | --- |
| dateFormat | The date format used for the text input, can be different from the save format |
| dateSaveFormat | The format in which the date is saved in the data. Note that if you specify a format which is incompatible with JSON Schema's "date" format then you should use the UI Schema based invocation, otherwise the control will be marked with an error. |
| views | Array defining which views are displayed. Options: year, month, day |
| clearLabel | Label of the "clear" action in the time picker modal |
| cancelLabel | Label of the "cancel" action in the time picker modal |
| okLabel | Label of the "confirm" action in the time picker modal |

The following example showcases some of the options. Only Year and month are selected as views, this means the user is only able to pick a year and a month, but not the day. We are also only saving the year and month to the data as we configured it in the dateFormat options.

- Demo
- Schema
- UI Schema
- Data

Year Month Picker

2026.02

schema.json

```
{  "properties": {    "date": {      "type": "string",      "description": "does not allow to select days"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/date",  "label": "Year Month Picker",  "options": {    "format": "date",    "clearLabel": "Clear it!",    "cancelLabel": "Abort",    "okLabel": "Do it",    "views": [      "year",      "month"    ],    "dateFormat": "YYYY.MM",    "dateSaveFormat": "YYYY-MM"  }}
```

```
{  "date": "2026-02-10"}
```

## Date-Time Picker[​](#date-time-picker "Direct link to Date-Time Picker")

The date-time picker will be used when `format: "date-time"` is specified for a string property in the JSON Schema. Alternatively `format: "date-time"` can also be specified via the UI Schema options.

### Schema Based[​](#schema-based-2 "Direct link to Schema Based")

A control will be rendered as a date-time picker when the format of the corresponding string property is set to "date-time" in the JSON Schema.

- Demo
- Schema
- UI Schema
- Data

Datetime

2026-02-10 16:46

schema.json

```
{  "properties": {    "datetime": {      "type": "string",      "format": "date-time",      "description": "schema-based datetime picker"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/datetime"}
```

```
{  "datetime": "2026-02-10T16:46:12.542Z"}
```

### UI Schema Based[​](#ui-schema-based-2 "Direct link to UI Schema Based")

A string control will also be rendered as a date-time picker by setting the property "format" to "date-time" in the UI Schema options.

- Demo
- Schema
- UI Schema
- Data

Datetime

2026-02-10 16:46

schema.json

```
{  "properties": {    "datetime": {      "type": "string",      "description": "uischema-based datetime picker"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/datetime",  "options": {    "format": "date-time"  }}
```

```
{  "datetime": "2026-02-10T16:46:12.542Z"}
```

### Options[​](#options-2 "Direct link to Options")

The React Material renderer set offers additional UI Schema options to customize the appearance of the date-time picker text input as well as the picker itself. Please also refer to the localization section of this page to get information on how to customize the locales.

## Date Time Picker Options

| Option | Description |
| --- | --- |
| dateTimeFormat | The date-time format used for the text input, can be different from the save format |
| dateTimeSaveFormat | The format in which the time is saved in the data. Note that if you specify a format which is incompatible with JSON Schema's "time" format then you should use the UI Schema based invocation, otherwise the control will be marked with an error. |
| ampm | If set to true, the time picker modal is presented in 12-hour format, otherwise the 24-hour format is used |
| clearLabel | Label of the "clear" action in the time picker modal |
| cancelLabel | Label of the "cancel" action in the time picker modal |
| okLabel | Label of the "confirm" action in the time picker modal |

The following example showcases some of the options.
The text input is configured to only show the day, month and year, while hours and minutes are also saved into the data.
The time picker presents itself in `am/pm` format.

- Demo
- Schema
- UI Schema
- Data

Datetime

10-02-26 04:46:pm

schema.json

```
{  "properties": {    "datetime": {      "type": "string",      "description": "uischema-based datetime picker"    }  }}
```

uischema.json

```
{  "type": "Control",  "scope": "#/properties/datetime",  "options": {    "format": "date-time",    "clearLabel": "Clear it!",    "cancelLabel": "Abort",    "okLabel": "Do it",    "dateTimeFormat": "DD-MM-YY hh:mm:a",    "dateTimeSaveFormat": "YYYY/MM/DD h:mm a",    "ampm": true  }}
```

```
{  "datetime": "2026-02-10T16:46:12.542Z"}
```

## Localization[​](#localization "Direct link to Localization")

The Material Renderer set let’s you customize the picker´s modal by selecting a locale. For this JSON Forms is using the dayjs library. You need to import dayjs and set the global “locale” variable. In the example below we import dayjs, the locals for English and German and set the global “locale” variable to English. You can do this anywhere in your application.

```
import dayjs from 'dayjs';import 'dayjs/locale/de';import 'dayjs/locale/en';dayjs.locale("en");
```

JSON Forms will now use the global variable for the picker´s modal. You can use JSON Forms in your preferred way. For example, like in the code snippet below.

```
<JsonForms  schema={schema}  uischema={uischema}  data={data}  renderers={materialRenderers}  cells={materialCells}  validationMode={currentValidationMode}/>
```

You can see the result in the example below. It is also possible to switch between different locales like we did in our example.

en

​

Date

2026-02-10

Date


---

---
title: "ReadOnly"
source: "https://jsonforms.io/docs/readonly"
---

# ReadOnly

JSON Forms allows to enable and disable any input, either programmatically, via JSON Schema or the UI schema.

## Form Wide[​](#form-wide "Direct link to Form Wide")

The whole form can be disabled by specifying the `readonly` flag on the `JsonForms` component itself.
This will disable *all* elements of this form.

```
<JsonForms  renderers={materialRenderers}  cells={materialCells}  data={data}  schema={schema}  uischema={uischema}  readonly/>
```

This flag is also supported by the Angular and Vue bindings.

- Demo
- Schema
- UI Schema
- Data

First Name

Last Name

schema.json

```
{  "properties": {    "firstName": {      "type": "string"    },    "lastName": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/firstName"    },    {      "type": "Control",      "scope": "#/properties/lastName"    }  ]}
```

```
{  "firstName": "Max",  "lastName": "Mustermann"}
```

## Schema based[​](#schema-based "Direct link to Schema based")

### UI Schema option[​](#ui-schema-option "Direct link to UI Schema option")

The option `readonly: true` can be set on any element in the UI schema:

```
{  type: "VerticalLayout",  elements: [    {      type: "Control",      scope: "#/properties/firstName",      options: {        readonly: true      }    }  ]}
```

- Demo
- Schema
- UI Schema
- Data

First Name

Last Name

schema.json

```
{  "properties": {    "firstName": {      "type": "string"    },    "lastName": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/firstName",      "options": {        "readOnly": true      }    },    {      "type": "Control",      "scope": "#/properties/lastName"    }  ]}
```

```
{  "firstName": "Max",  "lastName": "Mustermann"}
```

### JSON Schema[​](#json-schema "Direct link to JSON Schema")

To disable an input via JSON Schema, specify `readOnly: true`:

```
{  properties: {    firstName: {      type: "string",      readOnly: true    },  }}
```

Note: JSON Forms will ignore `readonly` within JSON Schemas [as only `readOnly` is part of the specification](https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.9.4).

- Demo
- Schema
- UI Schema
- Data

First Name

Last Name

schema.json

```
{  "properties": {    "firstName": {      "type": "string",      "readOnly": true    },    "lastName": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/firstName"    },    {      "type": "Control",      "scope": "#/properties/lastName"    }  ]}
```

```
{  "firstName": "Max",  "lastName": "Mustermann"}
```

### Rule[​](#rule "Direct link to Rule")

Any UI schema element can be enabled or disabled dynamically via our [rule support](/docs/uischema/rules).

```
{  type: "VerticalLayout",  elements: [    {      type: "Control",      scope: "#/properties/firstName",      rule: {        effect: "DISABLE",        condition: {          scope: "#",          schema: {} //always true        }      }    },    // OR    {      type: "Control",      scope: "#/properties/firstName",      rule: {        effect: "ENABLE",        condition: {          scope: "#",          schema: { not: {} } //always false        }      }    }  ]}
```

- Demo
- Schema
- UI Schema
- Data

First Name

Last Name

schema.json

```
{  "properties": {    "firstName": {      "type": "string"    },    "lastName": {      "type": "string"    }  }}
```

uischema.json

```
{  "type": "VerticalLayout",  "elements": [    {      "type": "Control",      "scope": "#/properties/firstName",      "rule": {        "effect": "DISABLE",        "condition": {          "scope": "#",          "schema": {}        }      }    },    {      "type": "Control",      "scope": "#/properties/lastName"    }  ]}
```

```
{  "firstName": "Max",  "lastName": "Mustermann"}
```

## Evaluation order[​](#evaluation-order "Direct link to Evaluation order")

JSON Forms determines the `enabled` status for each UI schema element based on the following order

1. When the form wide `readonly` is specified, all inputs will be disabled.
2. If an `ENABLE` or `DISABLE` rule exists, the UI schema element will be rendered accordingly.
3. If the UI schema `readonly` option is set, the UI schema element will be rendered accordingly.
4. If the JSON Schema `readOnly: true` attribute is specified, the UI schema element will be disabled.
5. If none of the above apply, the UI schema element will be enabled or disabled based on its parent.


---

---
title: "Ref Resolving"
source: "https://jsonforms.io/docs/ref-resolving"
---

# Ref Resolving

ATTENTION

With version 3.0 of JSON Forms, we no longer include `json-schema-ref-parser` within the core package.
The old documentation for JSON Forms < 3.0 can be found [here](/docs/deprecated/ref-resolving-legacy).
For a migration guide, have a look [here](https://github.com/eclipsesource/jsonforms/blob/master/MIGRATION.md).

JSON Forms is able to resolve basic JSON Schema `$ref` pointers which is sufficient for most use cases.
In case of complex reference setups or references pointing to external resources the schema needs to be resolved before handing it over to JSON Forms.
We recommend using a library like [`json-refs`](https://github.com/whitlockjc/json-refs/tree/master/docs) or [`json-schema-ref-parser`](https://apitools.dev/json-schema-ref-parser/) for these use cases.

Below you can find an example on how to use `json-refs` and `json-schema-ref-parser`:

```
import React, { useState } from 'react';import { JsonForms } from '@jsonforms/react';import { materialCells, materialRenderers } from '@jsonforms/material-renderers';import $RefParser from '@apidevtools/json-schema-ref-parser';import JsonRefs from 'json-refs';import mySchemaWithReferences from 'myschema.json';const yourRemoteSchemaResolver = {  order: 1,  canRead: function(file) {    return file.url.indexOf('yourRemoteSchemaIdentifier') !== -1;  },  read: function() {    return JSON.stringify(yourSchemaObject);  },};const refParserOptions = {  dereference: {    circular: false  },  resolve: {    foo: yourRemoteSchemaResolver}function App() {  const [data, setData] = useState(initialData);  const [resolvedSchema, setSchema] = useState();  useEffect(() => {    $RefParser.dereference(mySchemaWithReferences, refParserOptions).then(res => setSchema(res.$schema));    // or    JsonRefs.resolveRefs(mySchemaWithReferences).then(res => setSchema(res.resolved));  },[]);  if(resolvedSchema === undefined) {    return <div> Loading... </div>  }  return (    <JsonForms      schema={resolvedSchema}      uischema={uischema}      data={data}      renderers={materialRenderers}      cells={materialCells}      onChange={({ data, _errors }) => setData(data)}    />  );}
```


---

---
title: "Validation"
source: "https://jsonforms.io/docs/validation"
---

# Validation

Whenever you change data in the forms generated by JSON Forms, it will be validated in the background in order to display any messages that violate the JSON schema.

Validation is handled by [AJV](https://github.com/epoberezkin/ajv) and can be customized by passing a custom AJV instance as a prop to the `JsonForms` standalone component.

If you do not customize the validator, a default instance will be created for you. That default instance is configured as follows:

```
import Ajv from 'ajv';import addFormats from 'ajv-formats';const ajv = new AJV({  allErrors: true,  verbose: true,  strict: false,  ...options,});addFormats(ajv);
```

You can either create your own instance or you can use the `createAjv` function provided by JSON Forms that allows overriding the default options by passing in additional options.

For customizing or localizing AJV error messages we recommend [ajv-errors](https://github.com/ajv-validator/ajv-errors).

## ValidationMode[​](#validationmode "Direct link to ValidationMode")

There are three different validation modes:

- `ValidateAndShow`: Validates, emits and shows errors (which is the default)
- `ValidateAndHide`: Validates and emits errors, but does not show them
- `NoValidation`: Does not validate at all

You can set the validation mode in each JSON Form's root component.
For example in React it could look like this:

```
<JsonForms  schema={schema}  uischema={uischema}  data={data}  renderers={materialRenderers}  cells={materialCells}  validationMode={currentValidationMode}/>
```

Here you can see the different modes in action

Firstname

Firstname

Lastname \*

Lastname

must NOT have fewer than 1 characters

Switch Validation Mode

**Current validation mode:** ValidateAndShow

**Emitted errors:**

## External Validation Errors[​](#external-validation-errors "Direct link to External Validation Errors")

External errors (e.g. coming from a backend) can be supplied to the form via the `additionalErrors` prop. These errors are mixed in with the regular errors coming from the AJV validation.
Whenever the external errors change, the prop needs to be updated. However, to avoid unnecessary rerenderings, it should be stable or memoized.

The `additionalErrors` are an array of type `ErrorObject` from [AJV](https://github.com/ajv-validator/ajv/blob/v8.6.1/lib/types/index.ts#L84).
The easiest way to declare an error for a property is by specifying the `instancePath`, which represents the path of the property in the schema,
and a `message` string which will be used to display the error in the form.

```
const AdditionalErrorsExample = () => {    const [additionalErrors, setAdditionalErrors] = useState<ErrorObject[]>([]);    const addAdditionalError = () => {      const newError: ErrorObject = {          // AJV style path to the property in the schema          instancePath: '/lastname',          // message to display          message: 'New error',          schemaPath: '',          keyword: '',          params: {},      };      setAdditionalErrors(errors => [...errors, newError]);  };    return (        <div>            <JsonForms                schema={schema}                uischema={uischema}                data={formData}                renderers={materialRenderers}                cells={materialCells}                additionalErrors={additionalErrors}            />            <Button onClick={addAdditionalError} >                Add Additional Error            </Button>        </div>    );};
```

Note that the `validationMode` property has no effect on `additionalErrors`, so even when handing over `NoValidation` or `ValidateAndHide`, the additional errors will still be shown.

Firstname

Firstname

Lastname \*

Lastname

must NOT have fewer than 1 characters

Add Additional ErrorSwitch Validation Mode

**Additional errors:**

**Emitted errors:**

**Current validation mode:** ValidateAndShow


---

---
title: "JSON Forms Middleware"
source: "https://jsonforms.io/docs/middleware"
---

# JSON Forms Middleware

JSON Forms offers the option to employ middleware, allowing you to integrate deeply with JSON Forms and directly modify JSON Forms state.
This enables various use cases, for example to use JSON Forms in a controlled style and implementing custom data updates and validation methods.

ATTENTION

Middlewares allow for very powerful customization of internal JSON Forms behavior.
Proceed with caution as it's easy to break core functionality if used inappropriately.

In this chapter, we'll introduce the JSON Forms reducer pattern and its key actions.
Through two examples, we'll demonstrate how middleware enables controlled and customized form interactions.

## JSON Forms Reducer Pattern and Actions[​](#json-forms-reducer-pattern-and-actions "Direct link to JSON Forms Reducer Pattern and Actions")

JSON Forms adheres to the reducer pattern for maintaining a consistent application state. The reducer pattern comprises:

**State:** Representing the current application state, encompassing all necessary data.

**Action:**
Representing a user action or a triggered event, described by objects. Actions are the way to communicate with the reducer to request a state change.

**Reducer:**
A function that accepts the current state and an action as arguments, generating a new state based on the action. It is responsible for managing different action types and updating the state accordingly.

**Dispatcher:**
Serving as a mechanism for managing the flow of actions. In the case of JSON Forms, when an action is created, it is dispatched to the dispatcher, which then distributes the action to the reducer for processing.

JSON Forms' most important actions are: `INIT`, `UPDATE_CORE` and `UPDATE_DATA`.

`INIT` is triggered on initiation, setting up the initial state and validating the form.
`UPDATE_DATA` is triggered whenever data within JSON Forms is changed.
`UPDATE_CORE` is triggered, whenever props handed over to JSON Forms are changed.

## JSON Forms Middleware[​](#json-forms-middleware-1 "Direct link to JSON Forms Middleware")

When a middleware is handed over to JSON Forms, it will be called during dispatching instead of the regular reducer.
The middleware can apply arbitrary changes and therefore has full power over the JSON Forms state.
The middleware's arguments are the current JSON Forms state, the dispatched action and the default reducer of JSON Forms.

```
interface Middleware {  (    state: JsonFormsCore,    action: CoreActions,    defaultReducer: (state: JsonFormsCore, action: CoreActions) => JsonFormsCore  ): JsonFormsCore;}
```

The default reducer can be used to apply the default behavior of JSON Forms for the action in question.
The following middleware has the same effect as not using any middleware:

```
const middleware = (  state: JsonFormsCore,  action: CoreActions,  defaultReducer: (state: JsonFormsCore, action: CoreActions) => JsonFormsCore) => {  return defaultReducer(state, action);};
```

In the following, we will explore two examples demonstrating how middlewares can be utilized to provide custom implementations for JSON Forms actions.

### Dependent Fields[​](#dependent-fields "Direct link to Dependent Fields")

In this scenario one field depends on another.
For instance, consider a carwash service that offers various services and calculates a price based on the selected options.
We can utilize middleware to compute and set the price. When an `UPDATE_DATA` action is triggered, we initially invoke the default reducer to update the data and identify any errors.
Subsequently, we adjust the price fields based on the selected services and update the state with the newly calculated data.
We additionally override the `INIT` and `UPDATE_CORE` actions, in case the data prop passed to JSON Forms doesn't have the correct price set yet.

```
import { INIT, UPDATE_DATA } from  '@jsonforms/core'...const middleware = useCallback((state, action, defaultReducer) => {  const newState = defaultReducer(state, action);  switch (action.type) {    case INIT:    case UPDATE_CORE:    case UPDATE_DATA: {      if (newState.data.services.length * 15 !== newState.data.price) {        newState.data.price = newState.data.services.length * 15;      }      return newState;    }    default:      return newState;  }});...<JsonForms  data={data}  schema={schema}  renderers={materialRenderers}  middleware={middleware}/>
```

- Demo
- Schema
- UI Schema
- Data

Services

Wash (15$)Polish (15$)Interior (15$)

Price

schema.json

```
{  "type": "object",  "properties": {    "services": {      "type": "array",      "uniqueItems": true,      "items": {        "oneOf": [          {            "const": "Wash (15$)"          },          {            "const": "Polish (15$)"          },          {            "const": "Interior (15$)"          }        ]      }    },    "price": {      "type": "number",      "readOnly": true    }  }}
```

uischema.json

```
{}
```

```
{  "services": [    "Wash (15$)",    "Polish (15$)"  ],  "price": 30}
```

### Using JSON Forms in controlled style[​](#using-json-forms-in-controlled-style "Direct link to Using JSON Forms in controlled style")

In this example, we'll look at a form that lets you choose your activity for the weekend and validates that activity based on the current weather.
Using middleware, we'll implement this example in JSON Forms with a controlled approach, meaning data and errors are stored in the parent components state.

When an `INIT` or `UPDATE_DATA` action is triggered, we update the data in the parent's state and invoke our custom validation function, but return the original state in the middleware.
This way JSON Forms doesn't update its internal state. Instead, the data and errors from the parent component are passed as properties to JSON Forms.
In combination with the `NoValidation` mode, JSON Forms is entirely controlled by its parent component.

```
import { INIT, UPDATE_DATA } from '@jsonforms/core';export const ControlledStyle = () => {  const [errors, setErrors] = useState([]);  const [data, setData] = useState({ activity: 'Snowboarding' });  const validateActivity = useCallback((data) => {    switch (data.activity) {      case 'Snowboarding':        setErrors([          {            instancePath: '/activity',            message: 'No Snow',            schemaPath: '#/properties/activity',          },        ]);        break;      case 'Soccer':        setErrors([          {            instancePath: '/activity',            message: 'Too Cold',            schemaPath: '#/properties/activity',          },        ]);        break;      default:        setErrors([]);    }  }, []);  const middleware = useCallback(    (state, action, defaultReducer) => {      const newState = defaultReducer(state, action);      switch (action.type) {        case INIT:        case UPDATE_DATA: {          setData(newState.data);          validateActivity(newState.data);          return state;        }        default:          return newState;      }    },[]  );  return (    <JsonForms      data={data}      schema={schema}      renderers={materialRenderers}      middleware={middleware}      additionalErrors={errors}      validationMode='NoValidation'    />  );};<ControlledStyle />
```


---

