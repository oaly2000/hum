# create-hum

## 0.0.4

### Patch Changes

- Rename the client-navigation opt-in attribute from `f-client-nav` to
  `data-hum-client-nav`, and let it be switched off per subtree with
  `data-hum-client-nav="false"`. Update the scaffold to the new attribute name.

## 0.0.3

### Patch Changes

- Replace the `{{name}}` placeholder in every scaffolded file, including templates that write it as `{{ name }}`, so new projects no longer ship an unresolved title.

## 0.0.2

### Patch Changes

- Move packages to the `@humjs` scope and publish them to npm with Trusted Publishing.
