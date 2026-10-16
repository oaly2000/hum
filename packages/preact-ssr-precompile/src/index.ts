import { parseSync } from "rolldown/utils";
import {
	generateTransform,
	rolldownString,
	withMagicString,
	type RolldownString,
} from "rolldown-string";
import type { ESTree, ParserOptions } from "rolldown/utils";
import type { Plugin } from "vite";

type FilterPattern = string | RegExp | ReadonlyArray<string | RegExp>;
type AstNode = ESTree.Node;
type JSXNode = ESTree.JSXElement | ESTree.JSXFragment;

export type PrecompileAstNode = ESTree.Node;
export type PrecompileJsxElement = ESTree.JSXElement;
export type PrecompileJsxExpression = ESTree.JSXExpression;

interface Replacement {
	start: number;
	end: number;
	code: string;
}

interface Template {
	name: string;
	strings: string[];
}

export interface PrecompileContext {
	fileName: string;
	source: string;
	ancestors: readonly PrecompileAstNode[];
	mapCallbackParams: readonly string[];
}

export type PrecompileElementRule = (
	node: PrecompileJsxElement,
	context: PrecompileContext,
) => boolean;

export type PrecompileExclusionRule = PrecompileElementRule;

export const isHumInteractiveElement: PrecompileElementRule = (
	node,
	context,
) => {
	if (node.openingElement.name.type !== "JSXIdentifier") return false;
	const tagName = node.openingElement.name.name;
	if (tagName[0] !== tagName[0]?.toLowerCase()) return false;

	for (const attribute of node.openingElement.attributes) {
		if (attribute.type === "JSXSpreadAttribute") return true;
		if (attribute.name.type !== "JSXIdentifier") continue;

		const name = attribute.name.name;
		if (name === "key" || name === "ref") continue;
		if (/^on[A-Z]/.test(name)) return true;
		if (
			attribute.value?.type === "JSXExpressionContainer" &&
			attribute.value.expression.type !== "Literal" &&
			attribute.value.expression.type !== "JSXEmptyExpression"
		) return true;
	}

	return node.children.some((child) =>
		child.type === "JSXExpressionContainer" &&
		isOuterScopeDynamicChild(child.expression, context.mapCallbackParams)
	);
};

export interface PreactSsrPrecompileOptions {
	include?: FilterPattern;
	exclude?: FilterPattern;
	importSource?: string;
	ssrOnly?: boolean;
	preserveElements?: readonly (string | PrecompileElementRule)[];
	dynamicProps?: string[];
	preserveInteractiveElements?: boolean;
}

export interface TransformPreactSsrJsxOptions {
	importSource?: string;
	preserveElements?: readonly (string | PrecompileElementRule)[];
	dynamicProps?: string[];
	preserveInteractiveElements?: boolean;
}

type InternalPrecompileOptions = PreactSsrPrecompileOptions & {
	skipElements?: string[];
};

const DEFAULT_INCLUDE = [/\.[cm]?[tj]sx?$/];
const DEFAULT_EXCLUDE = [/node_modules/];
const DEFAULT_IMPORT_SOURCE = "preact";
const DEFAULT_SKIP_ELEMENTS = new Set([
	"html",
	"head",
	"body",
	"svg",
	"math",
	"textarea",
	"select",
	"option"
]);
const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
]);
const HTML_ENUMERATED_ATTRS = new Set(["draggable", "spellcheck"]);
const NAMESPACE_REPLACE_REGEX = /^(xlink|xmlns|xml)([A-Z])/;
const HTML_LOWER_CASE = /^(?:accessK|auto[A-Z]|cell|ch|col|cont|cross|dateT|encT|form[A-Z]|frame|hrefL|inputM|maxL|minL|noV|playsI|popoverT|readO|rowS|src[A-Z]|tabI|useM|item[A-Z])/;
const UNSAFE_NAME = /[\s\n\\/='"<>]/;
const ENCODED_ENTITIES = /["&<]/;
const IDENTIFIER_NAME = /^[$A-Z_a-z][$\w]*$/;
/**
* Create a Vite/Rolldown plugin that precompiles safe Preact JSX for server
* bundles into `jsxTemplate()` calls understood by `preact-render-to-string`.
*/
function preactSsrPrecompile(options: PreactSsrPrecompileOptions = {}): Plugin {
	const filter = createSimpleFilter(options.include ?? DEFAULT_INCLUDE, options.exclude ?? DEFAULT_EXCLUDE);
	const ssrOnly = options.ssrOnly ?? true;
	const preserveInteractiveElements = options.preserveInteractiveElements ?? true;
	return {
		name: "preact-ssr-precompile",
		enforce: "pre",
		transform: {
			filter: { id: /\.[cm]?[jt]sx?(?:$|\?)/ },
			handler: withMagicString(function(
				s: RolldownString,
				id: string,
				transformOptions?: { ssr?: boolean },
			) {
				const filename = stripQuery(id);
				if (ssrOnly && transformOptions?.ssr !== true) return;
				if (!filter(filename)) return;
				if (!looksLikeJSX(s.original)) return;
				const preservedElements = findPreservedElements(filename, s.original, {
					preserveElements: options.preserveElements,
					preserveInteractiveElements,
				});
				transformPreactSsrMagicString(s, filename, {
					...options,
					skipElements: preservedElements
				});
			})
		}
	};
}
/** Transform JSX in a single module. Exposed for tests and non-Vite integrations. */
function transformPreactSsrJsx(
	code: string,
	id = "preact-ssr.tsx",
	options: TransformPreactSsrJsxOptions = {},
): string | null {
	const preservedElements = findPreservedElements(id, code, options);
	const s = rolldownString(code, id);
	if (!transformPreactSsrMagicString(s, id, {
		...options,
		skipElements: preservedElements
	})) return null;
	const result = generateTransform(s, id, true);
	return result ? String(result.code) : null;
}

function findPreservedElements(
	id: string,
	code: string,
	options: PreactSsrPrecompileOptions | TransformPreactSsrJsxOptions,
): string[] {
	const preservedNames = new Set<string>();
	const preserveRules: PrecompileElementRule[] = [];
	for (const element of options.preserveElements ?? []) {
		if (typeof element === "string") preservedNames.add(element);
		else preserveRules.push(element);
	}

	let program;
	try {
		program = parseProgram(id, code);
	} catch {
		return [...preservedNames];
	}

	function visit(
		node: AstNode,
		mappedParams = new Set<string>(),
		ancestors: AstNode[] = [],
	): void {
		if (!isNode(node)) return;
		if (node.type === "JSXElement") {
			const opening = node.openingElement;
			const tagName = getElementIdentifierName(opening?.name);
			if (tagName) {
				const element = describeElement(node, mappedParams);
				const shouldPreserve = preserveRules.some((rule) =>
					rule(node, {
						fileName: id,
						source: code,
						ancestors,
						mapCallbackParams: [...mappedParams]
					})
				);
				if (
					(options.preserveInteractiveElements !== false &&
						isLikelyInteractiveElement(element)) ||
					shouldPreserve
				) preservedNames.add(tagName);
			}
		}
		const mapCallback = getMapCallback(node);
		if (mapCallback) {
			const callbackParams = new Set(mappedParams);
			for (const param of getNodeArray(mapCallback.params)) {
				collectPatternIdentifiers(param, callbackParams);
			}
			for (const [key, value] of Object.entries(node)) {
				if (key === "parent" || key === "comments") continue;
				if (Array.isArray(value)) {
					for (const child of value) {
						visit(
							child,
							child === mapCallback ? callbackParams : mappedParams,
							[...ancestors, node],
						);
					}
				} else if (isNode(value)) {
					visit(
						value,
						value === mapCallback ? callbackParams : mappedParams,
						[...ancestors, node],
					);
				}
			}
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === "parent" || key === "comments") continue;
			if (Array.isArray(value)) {
				for (const child of value) {
					visit(child, mappedParams, [...ancestors, node]);
				}
			} else if (isNode(value)) {
				visit(value, mappedParams, [...ancestors, node]);
			}
		}
	}
	visit(program);
	return [...preservedNames];
}

function describeElement(
	node: ESTree.JSXElement,
	mappedParams: Set<string>,
): ElementFeatures {
	let hasSpreadProps = false;
	let hasDynamicProps = false;
	let hasEventProps = false;
	for (const attribute of getNodeArray(node.openingElement?.attributes)) {
		if (attribute.type === "JSXSpreadAttribute") {
			hasSpreadProps = true;
			continue;
		}
		if (attribute.type !== "JSXAttribute") continue;
		const name = getAttributeName(attribute, "");
		if (!name) continue;
		if (name === "key" || name === "ref") continue;
		if (/^on[A-Za-z]/.test(name)) hasEventProps = true;
		if (
			attribute.value?.type === "JSXExpressionContainer" &&
			attribute.value.expression?.type !== "Literal"
		) hasDynamicProps = true;
	}
	return {
		hasSpreadProps,
		hasDynamicProps,
		hasEventProps,
		hasDynamicChildren: getNodeArray(node.children).some((child) =>
			child.type === "JSXExpressionContainer" &&
			child.expression?.type !== "JSXEmptyExpression"
		),
		hasOuterScopeDynamicChildren: node.children.some((child) =>
			child.type === "JSXExpressionContainer" &&
			isOuterScopeDynamicChild(child.expression, mappedParams)
		)
	};
}

function getMapCallback(
	node: AstNode,
): ESTree.ArrowFunctionExpression | ESTree.Function | null {
	if (node.type !== "CallExpression") return null;
	const callee = node.callee;
	if (
		callee?.type !== "MemberExpression" ||
		callee.computed ||
		callee.property?.type !== "Identifier" ||
		callee.property.name !== "map"
	) return null;
	const callback = node.arguments?.[0];
	return callback?.type === "ArrowFunctionExpression" ||
		callback?.type === "FunctionExpression"
		? callback
		: null;
}

function collectPatternIdentifiers(
	node: AstNode,
	names: Set<string>,
): void {
	if (!isNode(node)) return;
	if (node.type === "Identifier") {
		names.add(String(node.name));
		return;
	}
	if (node.type === "RestElement") {
		collectPatternIdentifiers(node.argument, names);
	} else if (node.type === "AssignmentPattern") {
		collectPatternIdentifiers(node.left, names);
	} else if (node.type === "ArrayPattern") {
		for (const element of node.elements) {
			if (element) collectPatternIdentifiers(element, names);
		}
	} else if (node.type === "ObjectPattern") {
		for (const property of node.properties) {
			collectPatternIdentifiers(
				property.type === "RestElement" ? property.argument : property.value,
				names
			);
		}
	}
}

interface ElementFeatures {
	hasSpreadProps: boolean;
	hasDynamicProps: boolean;
	hasEventProps: boolean;
	hasDynamicChildren: boolean;
	hasOuterScopeDynamicChildren: boolean;
}

function isLikelyInteractiveElement(element: ElementFeatures): boolean {
	return element.hasSpreadProps || element.hasDynamicProps ||
		element.hasEventProps || element.hasOuterScopeDynamicChildren;
}

function isOuterScopeDynamicChild(
	expression: ESTree.JSXExpression,
	mappedParams: ReadonlySet<string> | readonly string[],
): boolean {
	const isMappedParam = (name: string) =>
		"has" in mappedParams
			? mappedParams.has(name)
			: mappedParams.includes(name);
	if (expression?.type === "Identifier") {
		return !isMappedParam(String(expression.name));
	}
	if (expression?.type === "MemberExpression") {
		const root = getMemberRoot(expression);
		return root?.type !== "Identifier" || !isMappedParam(String(root.name));
	}
	return false;
}

function getMemberRoot(expression: ESTree.Expression): ESTree.Expression {
	let root = expression;
	while (root?.type === "MemberExpression") root = root.object;
	return root;
}
function transformPreactSsrMagicString(
	s: RolldownString,
	id: string,
	options: InternalPrecompileOptions,
): boolean {
	let program;
	try {
		program = parseProgram(id, s.original);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[preact-ssr-precompile] Skipping ${id}: ${message}`);
		return false;
	}
	const ctx = new TransformContext(s.original, options, collectIdentifierNames(program));
	const replacements = ctx.collectJsxReplacements(program);
	if (replacements.length === 0) return false;
	for (const replacement of replacements) s.update(replacement.start, replacement.end, replacement.code);
	insertPrelude(s, program, ctx.renderPrelude());
	return true;
}
class TransformContext {
	code: string;
	dynamicProps: Set<string>;
	importSource: string;
	skipElements: Set<string>;
	jsxIdent: string;
	jsxTemplateIdent: string;
	jsxAttrIdent: string;
	jsxEscapeIdent: string;
	templateIndex = 0;
	takenNames: Set<string>;
	templates: Template[] = [];
	usedHelpers = new Set<string>();
	constructor(code: string, options: InternalPrecompileOptions, takenNames: Set<string>) {
		this.takenNames = takenNames;
		this.code = code;
		this.importSource = options.importSource ?? DEFAULT_IMPORT_SOURCE;
		this.dynamicProps = new Set(options.dynamicProps ?? []);
		this.skipElements = new Set([...DEFAULT_SKIP_ELEMENTS, ...options.skipElements ?? []]);
		this.jsxIdent = uniqueName("_jsx", takenNames);
		this.jsxTemplateIdent = uniqueName("_jsxTemplate", takenNames);
		this.jsxAttrIdent = uniqueName("_jsxAttr", takenNames);
		this.jsxEscapeIdent = uniqueName("_jsxEscape", takenNames);
	}
	collectJsxReplacements(node: AstNode): Replacement[] {
		const replacements: Replacement[] = [];
		this.collectJsxReplacementsInto(node, replacements);
		return replacements.sort((a, b) => a.start - b.start);
	}
	renderPrelude(): string {
		const imports = [
			["jsx", this.jsxIdent],
			["jsxTemplate", this.jsxTemplateIdent],
			["jsxAttr", this.jsxAttrIdent],
			["jsxEscape", this.jsxEscapeIdent]
		].filter(([helper]) => this.usedHelpers.has(helper)).map(([helper, alias]) => `${helper} as ${alias}`);
		if (imports.length === 0 && this.templates.length === 0) return "";
		const lines = [`import { ${imports.join(", ")} } from ${JSON.stringify(`${this.importSource}/jsx-runtime`)};`];
		for (const template of this.templates) lines.push(`const ${template.name} = [${template.strings.map((value) => JSON.stringify(value)).join(", ")}];`);
		return `${lines.join("\n")}\n`;
	}
	serializeJsx(node: JSXNode): string {
		if (node.type === "JSXFragment") {
			const strings: string[] = [""];
			const dynamics: string[] = [];
			this.serializeChildrenToTemplate(node.children, strings, dynamics, false);
			return this.genTemplate(strings, dynamics);
		}
		if (node.type !== "JSXElement") return "";
		const opening = node.openingElement;
		if (!this.isSerializableOpening(opening)) return this.serializeJsxToCall(node);
		const strings: string[] = [];
		const dynamics: string[] = [];
		this.serializeElementToTemplate(node, strings, dynamics);
		return this.genTemplate(strings, dynamics);
	}
	renderExpression(expr: AstNode): string {
		const replacements: Replacement[] = [];
		this.collectJsxReplacementsInto(expr, replacements);
		if (replacements.length === 0) return this.code.slice(expr.start, expr.end);
		return applyReplacementsInRange(this.code, expr.start, expr.end, replacements.sort((a, b) => a.start - b.start));
	}
	collectJsxReplacementsInto(node: AstNode, replacements: Replacement[]): void {
		if (!isNode(node)) return;
		if (node.type === "JSXElement" || node.type === "JSXFragment") {
			replacements.push({
				start: node.start,
				end: node.end,
				code: this.serializeJsx(node)
			});
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === "parent" || key === "comments") continue;
			if (Array.isArray(value)) for (const item of value) this.collectJsxReplacementsInto(item, replacements);
			else if (isNode(value)) this.collectJsxReplacementsInto(value, replacements);
		}
	}
	serializeElementToTemplate(
		node: ESTree.JSXElement,
		strings: string[],
		dynamics: string[],
	): void {
		const opening = node.openingElement;
		if (!this.isSerializableOpening(opening)) {
			strings.push("");
			dynamics.push(this.serializeJsxToCall(node));
			return;
		}
		if (strings.length === 0) strings.push("");
		const tagName = getElementIdentifierName(opening.name) ?? "";
		strings[strings.length - 1] += `<${encodeEntities(tagName)}`;
		for (const attr of getNodeArray(opening.attributes)) {
			if (attr.type !== "JSXAttribute") continue;
			this.serializeAttributeToTemplate(attr, strings, dynamics);
		}
		const children = node.children;
		if (VOID_ELEMENTS.has(tagName)) {
			strings[strings.length - 1] += "/>";
			return;
		}
		strings[strings.length - 1] += ">";
		this.serializeChildrenToTemplate(children, strings, dynamics, true);
		strings[strings.length - 1] += `</${tagName}>`;
	}
	serializeAttributeToTemplate(
		attr: ESTree.JSXAttribute,
		strings: string[],
		dynamics: string[],
	): void {
		const rawAttrName = getAttributeName(attr, this.code);
		if (!rawAttrName) return;
		const attrName = normalizeHtmlAttrName(rawAttrName);
		if (this.dynamicProps.has(rawAttrName) || attrName === "key" || attrName === "ref") {
			strings.push("");
			dynamics.push(this.jsxAttrCall(attrName, this.getAttributeValueExpression(attr)));
			return;
		}
		const value = attr.value;
		if (!value) {
			this.appendStaticAttribute(strings, attrName, true);
			return;
		}
		if (value.type === "Literal") {
			this.appendStaticAttribute(strings, attrName, value.value);
			return;
		}
		if (value.type === "JSXExpressionContainer") {
			const expr = value.expression;
			if (!expr || expr.type === "JSXEmptyExpression") return;
			if (expr.type === "Literal") {
				this.appendStaticAttribute(strings, attrName, expr.value);
				return;
			}
			strings.push("");
			dynamics.push(this.jsxAttrCall(attrName, this.renderExpression(expr)));
			return;
		}
		if (value.type === "JSXElement" || value.type === "JSXFragment") {
			strings.push("");
			dynamics.push(this.jsxAttrCall(attrName, this.serializeJsx(value)));
		}
	}
	serializeChildrenToTemplate(
		children: ESTree.JSXChild[],
		strings: string[],
		dynamics: string[],
		isParentSerializable: boolean,
	): void {
		for (const [index, child] of children.entries()) {
			if (child.type === "JSXText") {
				const text = jsxTextToString(String(child.value ?? ""), true, isParentSerializable && index === children.length - 1);
				strings[strings.length - 1] += text;
				continue;
			}
			if (child.type === "JSXExpressionContainer") {
				const expr = child.expression;
				if (!expr || expr.type === "JSXEmptyExpression") continue;
				const staticText = getStaticChildText(expr);
				if (staticText != null) {
					strings[strings.length - 1] += staticText;
					continue;
				}
				strings.push("");
				this.usedHelpers.add("jsxEscape");
				dynamics.push(`${this.jsxEscapeIdent}(${this.renderExpression(expr)})`);
				continue;
			}
			if (child.type === "JSXElement") {
				this.serializeElementToTemplate(child, strings, dynamics);
				continue;
			}
			if (child.type === "JSXFragment") this.serializeChildrenToTemplate(child.children, strings, dynamics, false);
		}
	}
	serializeJsxToCall(node: ESTree.JSXElement): string {
		const opening = node.openingElement;
		const isComponent = isComponentElementName(opening.name);
		const typeExpr = jsxElementNameToExpression(opening.name, this.code, isComponent);
		const props = [];
		let keyExpr;
		for (const attr of getNodeArray(opening.attributes)) {
			if (attr.type === "JSXSpreadAttribute") {
				const argument = attr.argument;
				props.push(`...${this.renderExpression(argument)}`);
				continue;
			}
			if (attr.type !== "JSXAttribute") continue;
			const rawAttrName = getAttributeName(attr, this.code);
			if (!rawAttrName) continue;
			const propName = isComponent ? rawAttrName : normalizeHtmlAttrName(rawAttrName);
			const value = attr.value;
			if (propName === "key") {
				keyExpr = value ? this.getAttributeValueExpression(attr) : "true";
				continue;
			}
			props.push(`${objectPropertyKey(propName)}: ${value ? this.getAttributeValueExpression(attr) : "true"}`);
		}
		const children = this.serializeChildrenToExpression(node.children);
		if (children) props.push(`children: ${children}`);
		const args: string[] = [
			typeExpr,
			props.length > 0 ? `{ ${props.join(", ")} }` : "null"
		];
		if (keyExpr) args.push(keyExpr);
		this.usedHelpers.add("jsx");
		return `${this.jsxIdent}(${args.join(", ")})`;
	}
	serializeChildrenToExpression(children: ESTree.JSXChild[]): string | null {
		const values: string[] = [];
		for (const [index, child] of children.entries()) {
			if (child.type === "JSXText") {
				const text = jsxTextToString(String(child.value ?? ""), false, index === children.length - 1);
				if (text !== "") values.push(JSON.stringify(text));
				continue;
			}
			if (child.type === "JSXExpressionContainer") {
				const expr = child.expression;
				if (!expr || expr.type === "JSXEmptyExpression") continue;
				if (isIgnoredLiteralChild(expr)) continue;
				values.push(this.renderExpression(expr));
				continue;
			}
			if (child.type === "JSXElement" || child.type === "JSXFragment") values.push(this.serializeJsx(child));
		}
		if (values.length === 0) return null;
		if (values.length === 1) return values[0];
		return `[${values.join(", ")}]`;
	}
	getAttributeValueExpression(attr: ESTree.JSXAttribute): string {
		const value = attr.value;
		if (!value) return "true";
		if (value.type === "Literal") return JSON.stringify(String(value.value ?? ""));
		if (value.type === "JSXExpressionContainer") {
			const expr = value.expression;
			if (!expr || expr.type === "JSXEmptyExpression") return "undefined";
			return this.renderExpression(expr);
		}
		if (value.type === "JSXElement" || value.type === "JSXFragment") return this.serializeJsx(value);
		return "undefined";
	}
	appendStaticAttribute(
		strings: string[],
		attrName: string,
		value: unknown,
	): void {
		if (value == null) return;
		if (isStringifiedBooleanAttr(attrName) && typeof value === "boolean") {
			strings[strings.length - 1] += ` ${encodeEntities(attrName)}=${JSON.stringify(String(value))}`;
			return;
		}
		if (value === false || typeof value === "function" || typeof value === "object") return;
		if (value === true || value === "") {
			strings[strings.length - 1] += ` ${encodeEntities(attrName)}`;
			return;
		}
		strings[strings.length - 1] += ` ${encodeEntities(attrName)}=${JSON.stringify(encodeEntities(String(value)))}`;
	}
	jsxAttrCall(attrName: string, expression: string): string {
		const serializedName = JSON.stringify(attrName);
		this.usedHelpers.add("jsxAttr");
		return `((attr) => attr ? " " + attr : "")(${isStringifiedBooleanAttr(attrName) ? `((value) => typeof value === "boolean" ? ${this.jsxAttrIdent}(${serializedName}, String(value)) : ${this.jsxAttrIdent}(${serializedName}, value))(${expression})` : `${this.jsxAttrIdent}(${serializedName}, ${expression})`})`;
	}
	genTemplate(strings: string[], dynamics: string[]): string {
		const templateName = uniqueName(`$$_tpl_${++this.templateIndex}`, this.takenNames);
		this.templates.push({
			name: templateName,
			strings
		});
		this.usedHelpers.add("jsxTemplate");
		return `${this.jsxTemplateIdent}(${[templateName, ...dynamics].join(", ")})`;
	}
	isSerializableOpening(opening: ESTree.JSXOpeningElement): boolean {
		const name = getElementIdentifierName(opening.name);
		if (!name) return false;
		if (isComponentTagName(name)) return false;
		if (this.skipElements.has(name)) return false;
		if (name.includes("-")) return false;
		if (name.includes("\0") || UNSAFE_NAME.test(name)) return false;
		for (const attr of getNodeArray(opening.attributes)) {
			if (attr.type === "JSXSpreadAttribute") return false;
			if (attr.type !== "JSXAttribute") continue;
			if (getAttributeName(attr, this.code) === "dangerouslySetInnerHTML") return false;
		}
		return true;
	}
}
function getStaticChildText(expr: ESTree.Expression): string | null {
	if (expr.type !== "Literal") return null;
	if (expr.value == null || typeof expr.value === "boolean") return "";
	return encodeEntities(String(expr.value));
}
function isIgnoredLiteralChild(expr: ESTree.Expression): boolean {
	return expr.type === "Literal" && (expr.value == null || typeof expr.value === "boolean");
}
function jsxElementNameToExpression(
	name: ESTree.JSXElementName,
	code: string,
	isComponent: boolean,
): string {
	if (name.type === "JSXIdentifier") {
		const tagName = String(name.name ?? "");
		return isComponent ? tagName : JSON.stringify(tagName);
	}
	if (name.type === "JSXMemberExpression" || name.type === "JSXNamespacedName") {
		if (name.type === "JSXNamespacedName") return JSON.stringify(code.slice(name.start, name.end));
		return code.slice(name.start, name.end);
	}
	return "";
}
function isComponentElementName(name: ESTree.JSXElementName): boolean {
	if (name.type === "JSXMemberExpression") return true;
	if (name.type !== "JSXIdentifier") return false;
	return isComponentTagName(String(name.name ?? ""));
}
function isComponentTagName(name: string): boolean {
	const first = name.charCodeAt(0);
	return first >= 65 && first <= 90;
}
function getElementIdentifierName(
	name: ESTree.JSXElementName | null | undefined,
): string | null {
	if (!name) return null;
	return name.type === "JSXIdentifier" ? String(name.name ?? "") : null;
}
function getAttributeName(attr: ESTree.JSXAttribute, code: string): string | null {
	const name = attr.name;
	if (!name) return null;
	if (name.type === "JSXIdentifier") return String(name.name ?? "");
	if (name.type === "JSXNamespacedName") return code.slice(name.start, name.end);
	return null;
}
function normalizeHtmlAttrName(name: string): string {
	switch (name) {
		case "htmlFor": return "for";
		case "className": return "class";
		case "defaultChecked": return "checked";
		case "defaultSelected": return "selected";
		case "defaultValue": return "value";
		case "acceptCharset": return "accept-charset";
		case "httpEquiv": return "http-equiv";
		default:
			if (NAMESPACE_REPLACE_REGEX.test(name)) return name.replace(NAMESPACE_REPLACE_REGEX, "$1:$2").toLowerCase();
			if (HTML_LOWER_CASE.test(name)) return name.toLowerCase();
			return name;
	}
}
function objectPropertyKey(name: string): string {
	return IDENTIFIER_NAME.test(name) ? name : JSON.stringify(name);
}
function jsxTextToString(
	value: string,
	escape: boolean,
	trimLastChild: boolean,
): string {
	let text = "";
	const lines = value.split(/\r\n|\r|\n/);
	for (const [index, originalLine] of lines.entries()) {
		let line = index === 0 ? originalLine : originalLine.trimStart();
		if (index < lines.length - 1 || trimLastChild) line = line.trimEnd();
		if (line === "") continue;
		if (index > 0 && text !== "") text += " ";
		text += line;
	}
	return escape ? encodeEntities(text) : text;
}
function encodeEntities(value: string): string {
	if (value.length === 0 || ENCODED_ENTITIES.test(value) === false) return value;
	let last = 0;
	let out = "";
	for (let index = 0; index < value.length; index++) {
		let replacement = "";
		switch (value.charCodeAt(index)) {
			case 34:
				replacement = "&quot;";
				break;
			case 38:
				replacement = "&amp;";
				break;
			case 60:
				replacement = "&lt;";
				break;
			default: continue;
		}
		if (index !== last) out += value.slice(last, index);
		out += replacement;
		last = index + 1;
	}
	if (last !== value.length) out += value.slice(last);
	return out;
}
function isStringifiedBooleanAttr(name: string): boolean {
	return name.charCodeAt(4) === 45 || HTML_ENUMERATED_ATTRS.has(name);
}
function insertPrelude(
	s: RolldownString,
	program: ESTree.Program,
	prelude: string,
): void {
	if (prelude.trim() === "") return;
	const insertAt = findPreludeInsertionPoint(s.original, program);
	const needsLeadingNewline = insertAt > 0 && !s.original.slice(0, insertAt).endsWith("\n");
	s.appendLeft(insertAt, `${needsLeadingNewline ? "\n" : ""}${prelude}`);
}
function findPreludeInsertionPoint(
	code: string,
	program: ESTree.Program,
): number {
	const body = getNodeArray(program.body);
	let insertAt = code.startsWith("#!") ? code.indexOf("\n") + 1 : 0;
	for (const statement of body) {
		if (statement.type === "ImportDeclaration") {
			insertAt = Math.max(insertAt, statement.end);
			continue;
		}
		if (statement.type === "ExpressionStatement") {
			const expression = statement.expression;
			if (expression?.type === "Literal" && typeof expression.value === "string") {
				insertAt = Math.max(insertAt, statement.end);
				continue;
			}
		}
		break;
	}
	while (code[insertAt] === "\r" || code[insertAt] === "\n") insertAt++;
	return insertAt;
}
function applyReplacementsInRange(
	code: string,
	start: number,
	end: number,
	replacements: Replacement[],
): string {
	let cursor = start;
	let out = "";
	for (const replacement of replacements) {
		if (replacement.start < cursor || replacement.end > end) continue;
		out += code.slice(cursor, replacement.start);
		out += replacement.code;
		cursor = replacement.end;
	}
	out += code.slice(cursor, end);
	return out;
}
function collectIdentifierNames(node: AstNode): Set<string> {
	const names = new Set<string>();
	function visit(value: AstNode): void {
		if (!isNode(value)) return;
		if ((value.type === "Identifier" || value.type === "JSXIdentifier") && typeof value.name === "string") names.add(value.name);
		for (const [key, child] of Object.entries(value)) {
			if (key === "parent" || key === "comments") continue;
			if (Array.isArray(child)) for (const item of child) visit(item);
			else if (isNode(child)) visit(child);
		}
	}
	visit(node);
	return names;
}
function uniqueName(base: string, takenNames: Set<string>): string {
	let name = base;
	let index = 1;
	while (takenNames.has(name)) name = `${base}_${index++}`;
	takenNames.add(name);
	return name;
}
function getNodeArray(value: unknown): AstNode[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}
function isNode(value: unknown): value is AstNode {
	return !!value && typeof value === "object" && "type" in value &&
		typeof value.type === "string";
}
function stripQuery(id: string): string {
	return id.split("?", 1)[0];
}
function parseProgram(id: string, code: string): ESTree.Program {
	const parseOptions = getParseOptions(id, code);
	return parseSync(id, code, {
		lang: parseOptions.lang,
		sourceType: parseOptions.sourceType
	}).program;
}
function getParseOptions(id: string, code: string): ParserOptions {
	const filename = stripQuery(id);
	const isCommonJS = /(^|\W)require\s*\(|(^|\W)module\.exports\b|(^|\W)exports\./.test(code);
	let lang: ParserOptions["lang"] = "js";
	if (/\.[cm]?tsx$/i.test(filename)) lang = "tsx";
	else if (/\.[cm]?ts$/i.test(filename)) lang = looksLikeJSX(code) ? "tsx" : "ts";
	else if (/\.[cm]?jsx$/i.test(filename)) lang = "jsx";
	else if (looksLikeJSX(code)) lang = "jsx";
	return {
		lang,
		sourceType: isCommonJS ? "commonjs" : "module"
	};
}
function looksLikeJSX(code: string): boolean {
	return /<>|<\/[A-Za-z]|<[A-Za-z]/.test(code);
}
function createSimpleFilter(
	include: FilterPattern,
	exclude: FilterPattern,
): (id: string) => boolean {
	const includes = normalizeFilterPattern(include);
	const excludes = normalizeFilterPattern(exclude);
	return (id) => matchesAny(id, includes) && !matchesAny(id, excludes);
}
function normalizeFilterPattern(pattern: FilterPattern): Array<string | RegExp> {
	if (typeof pattern === "string" || pattern instanceof RegExp) return [pattern];
	return [...pattern];
}
function matchesAny(id: string, patterns: Array<string | RegExp>): boolean {
	return patterns.some((pattern) => {
		if (typeof pattern === "string") return id.includes(pattern);
		return pattern.test(id);
	});
}
export { preactSsrPrecompile as default, preactSsrPrecompile, transformPreactSsrJsx };
