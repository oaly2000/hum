// Global styles stay on the client side. TailwindCSS is pulled in here so its
// generated stylesheet becomes part of the runtime chunk in production and is
// injected into the document head by the dev server in development.
import "./style.css";

// Factories a page uses from its own module have to be evaluated in the browser
// as well, because only their name travels in the payload. Importing them here
// is the convention when they are not exported from an island.
import "./factories.js";

export {};
