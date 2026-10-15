import { dirname, join, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STATUS_CODES, ServerResponse, createServer } from "node:http";
import { Http2ServerRequest, constants } from "node:http2";
import { Readable } from "node:stream";
import { versions } from "node:process";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT;
var init_constants$2 = __esmMin((() => {
	GET_MATCH_RESULT = Symbol();
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/utils/buffer.js
var bufferToFormData;
var init_buffer = __esmMin((() => {
	bufferToFormData = (arrayBuffer, contentType) => {
		return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/utils/body.js
/**
* Parses form data from a request.
*
* @template T - The type of the parsed body data.
* @param {HonoRequest | Request} request - The request object containing form data.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {Promise<T>} The parsed body data.
*/
async function parseFormData(request, options) {
	if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
	const headers = isRawRequest(request) ? request.headers : request.raw.headers;
	const arrayBuffer = await request.arrayBuffer();
	const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
	if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
	const formData = await formDataPromise;
	if (formData) return convertFormDataToBodyData(formData, options);
	return {};
}
/**
* Converts form data to body data based on the provided options.
*
* @template T - The type of the parsed body data.
* @param {FormData} formData - The form data to convert.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {T} The converted body data.
*/
function convertFormDataToBodyData(formData, options) {
	const form = Object.create(null);
	const nestingState = { count: 0 };
	formData.forEach((value, key) => {
		if (!(options.all || key.endsWith("[]"))) form[key] = value;
		else handleParsingAllValues(form, key, value);
	});
	if (options.dot) Object.entries(form).forEach(([key, value]) => {
		if (key.includes(".")) {
			handleParsingNestedValues(form, key, value, nestingState);
			delete form[key];
		}
	});
	return form;
}
var MAX_NESTED_OBJECTS, isRawRequest, parseBody, handleParsingAllValues, handleParsingNestedValues, throwNestingLimitExceeded;
var init_body = __esmMin((() => {
	init_buffer();
	MAX_NESTED_OBJECTS = 1e4;
	isRawRequest = (request) => "headers" in request;
	parseBody = async (request, options = Object.create(null)) => {
		const { all = false, dot = false } = options;
		const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
		if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
			all,
			dot
		});
		return {};
	};
	handleParsingAllValues = (form, key, value) => {
		if (form[key] !== void 0) {
			if (Array.isArray(form[key])) form[key].push(value);
			else form[key] = [form[key], value];
		} else if (!key.endsWith("[]")) form[key] = value;
		else form[key] = [value];
	};
	handleParsingNestedValues = (form, key, value, state) => {
		if (/(?:^|\.)__proto__\./.test(key)) return;
		let nestedForm = form;
		const keys = key.split(".", 34);
		if (keys.length > 33) throwNestingLimitExceeded();
		keys.forEach((key, index) => {
			if (index === keys.length - 1) nestedForm[key] = value;
			else {
				if (!nestedForm[key] || typeof nestedForm[key] !== "object" || Array.isArray(nestedForm[key]) || nestedForm[key] instanceof File) {
					if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
					nestedForm[key] = Object.create(null);
				}
				nestedForm = nestedForm[key];
			}
		});
	};
	throwNestingLimitExceeded = () => {
		throw new Error("Nesting limit exceeded");
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/utils/url.js
var splitPath, splitRoutingPath, extractGroupsFromPath, replaceGroupMarks, patternCache, getPattern, tryDecode$1, tryDecodeURI$1, getPath, getPathNoStrict, mergePath, checkOptionalParameter, tryDecodeURIComponent, _decodeURI, _getQueryParam, getQueryParam, getQueryParams, decodeURIComponent_;
var init_url = __esmMin((() => {
	splitPath = (path) => {
		const paths = path.split("/");
		if (paths[0] === "") paths.shift();
		return paths;
	};
	splitRoutingPath = (routePath) => {
		const { groups, path } = extractGroupsFromPath(routePath);
		const paths = splitPath(path);
		return replaceGroupMarks(paths, groups);
	};
	extractGroupsFromPath = (path) => {
		const groups = [];
		path = path.replace(/\{[^}]+\}/g, (match, index) => {
			const mark = `@${index}`;
			groups.push([mark, match]);
			return mark;
		});
		return {
			groups,
			path
		};
	};
	replaceGroupMarks = (paths, groups) => {
		for (let i = groups.length - 1; i >= 0; i--) {
			const [mark] = groups[i];
			for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
				paths[j] = paths[j].replace(mark, groups[i][1]);
				break;
			}
		}
		return paths;
	};
	patternCache = {};
	getPattern = (label, next) => {
		if (label === "*") return "*";
		const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
		if (match) {
			const cacheKey = `${label}#${next}`;
			if (!patternCache[cacheKey]) {
				if (match[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
					cacheKey,
					match[1],
					new RegExp(`^${match[2]}(?=/${next})`)
				] : [
					label,
					match[1],
					new RegExp(`^${match[2]}$`)
				];
				else patternCache[cacheKey] = [
					label,
					match[1],
					true
				];
			}
			return patternCache[cacheKey];
		}
		return null;
	};
	tryDecode$1 = (str, decoder) => {
		try {
			return decoder(str);
		} catch {
			return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
				try {
					return decoder(match);
				} catch {
					return match;
				}
			});
		}
	};
	tryDecodeURI$1 = (str) => tryDecode$1(str, decodeURI);
	getPath = (request) => {
		const url = request.url;
		const start = url.indexOf("/", url.indexOf(":") + 4);
		let i = start;
		for (; i < url.length; i++) {
			const charCode = url.charCodeAt(i);
			if (charCode === 37) {
				const queryIndex = url.indexOf("?", i);
				const hashIndex = url.indexOf("#", i);
				const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
				const path = url.slice(start, end);
				return tryDecodeURI$1(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
			} else if (charCode === 63 || charCode === 35) break;
		}
		return url.slice(start, i);
	};
	getPathNoStrict = (request) => {
		const result = getPath(request);
		return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
	};
	mergePath = (base, sub, ...rest) => {
		if (rest.length) sub = mergePath(sub, ...rest);
		return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
	};
	checkOptionalParameter = (path) => {
		if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
		const segments = path.split("/");
		const results = [];
		let basePath = "";
		segments.forEach((segment) => {
			if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
			else if (/\:/.test(segment)) {
				if (segment.charCodeAt(segment.length - 1) === 63) {
					if (results.length === 0 && basePath === "") results.push("/");
					else results.push(basePath);
					const optionalSegment = segment.slice(0, -1);
					basePath += "/" + optionalSegment;
					results.push(basePath);
				} else basePath += "/" + segment;
			}
		});
		return results.filter((v, i, a) => a.indexOf(v) === i);
	};
	tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode$1(str, decodeURIComponent_) : str;
	_decodeURI = (value) => {
		if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
		return tryDecodeURIComponent(value);
	};
	_getQueryParam = (url, key, multiple) => {
		const hashIndex = url.indexOf("#", 8);
		if (hashIndex !== -1) url = url.slice(0, hashIndex);
		let encoded;
		if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
			let keyIndex = url.indexOf("?", 8);
			if (keyIndex === -1) return;
			if (!url.startsWith(key, keyIndex + 1)) keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
			while (keyIndex !== -1) {
				const trailingKeyCode = url.charCodeAt(keyIndex + key.length + 1);
				if (trailingKeyCode === 61) {
					const valueIndex = keyIndex + key.length + 2;
					const endIndex = url.indexOf("&", valueIndex);
					return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
				} else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
				keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
			}
			encoded = /[%+]/.test(url);
			if (!encoded) return;
		}
		const results = Object.create(null);
		encoded ??= /[%+]/.test(url);
		let keyIndex = url.indexOf("?", 8);
		while (keyIndex !== -1) {
			const nextKeyIndex = url.indexOf("&", keyIndex + 1);
			let valueIndex = url.indexOf("=", keyIndex);
			if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
			let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
			if (encoded) name = _decodeURI(name);
			keyIndex = nextKeyIndex;
			if (name === "") continue;
			let value;
			if (valueIndex === -1) value = "";
			else {
				value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
				if (encoded) value = _decodeURI(value);
			}
			if (multiple) {
				if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
				results[name].push(value);
			} else results[name] ??= value;
		}
		return key ? results[key] : results;
	};
	getQueryParam = _getQueryParam;
	getQueryParams = (url, key) => {
		return _getQueryParam(url, key, true);
	};
	decodeURIComponent_ = decodeURIComponent;
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/request.js
var HonoRequest;
var init_request = __esmMin((() => {
	init_constants$2();
	init_body();
	init_url();
	HonoRequest = class {
		/**
		* `.raw` can get the raw Request object.
		*
		* @see {@link https://hono.dev/docs/api/request#raw}
		*
		* @example
		* ```ts
		* // For Cloudflare Workers
		* app.post('/', async (c) => {
		*   const metadata = c.req.raw.cf?.hostMetadata?
		*   ...
		* })
		* ```
		*/
		raw;
		#validatedData;
		#matchResult;
		routeIndex = 0;
		/**
		* `.path` can get the pathname of the request.
		*
		* @see {@link https://hono.dev/docs/api/request#path}
		*
		* @example
		* ```ts
		* app.get('/about/me', (c) => {
		*   const pathname = c.req.path // `/about/me`
		* })
		* ```
		*/
		path;
		bodyCache = {};
		constructor(request, path = "/", matchResult = [[]]) {
			this.raw = request;
			this.path = path;
			this.#matchResult = matchResult;
		}
		param(key) {
			return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
		}
		#getDecodedParam(key) {
			const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
			const param = this.#getParamValue(paramKey);
			return param && tryDecodeURIComponent(param);
		}
		#getAllDecodedParams() {
			const decoded = {};
			const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
			for (const key of keys) {
				const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
				if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
			}
			return decoded;
		}
		#getParamValue(paramKey) {
			return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
		}
		query(key) {
			return getQueryParam(this.url, key);
		}
		queries(key) {
			return getQueryParams(this.url, key);
		}
		header(name) {
			if (name) return this.raw.headers.get(name) ?? void 0;
			const headerData = Object.create(null);
			this.raw.headers.forEach((value, key) => {
				headerData[key] = value;
			});
			return headerData;
		}
		async parseBody(options) {
			return parseBody(this, options);
		}
		#cachedBody = (key) => {
			const { bodyCache, raw } = this;
			const cachedBody = bodyCache[key];
			if (cachedBody) return cachedBody;
			for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
				if (anyCachedKey === "json") body = JSON.stringify(body);
				const contentType = anyCachedKey === "formData" ? void 0 : raw.headers.get("content-type");
				return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
			});
			return bodyCache[key] = raw[key]();
		};
		/**
		* `.json()` can parse Request body of type `application/json`
		*
		* @see {@link https://hono.dev/docs/api/request#json}
		*
		* @example
		* ```ts
		* app.post('/entry', async (c) => {
		*   const body = await c.req.json()
		* })
		* ```
		*/
		json() {
			return this.#cachedBody("text").then((text) => JSON.parse(text));
		}
		/**
		* `.text()` can parse Request body of type `text/plain`
		*
		* @see {@link https://hono.dev/docs/api/request#text}
		*
		* @example
		* ```ts
		* app.post('/entry', async (c) => {
		*   const body = await c.req.text()
		* })
		* ```
		*/
		text() {
			return this.#cachedBody("text");
		}
		/**
		* `.arrayBuffer()` parse Request body as an `ArrayBuffer`
		*
		* @see {@link https://hono.dev/docs/api/request#arraybuffer}
		*
		* @example
		* ```ts
		* app.post('/entry', async (c) => {
		*   const body = await c.req.arrayBuffer()
		* })
		* ```
		*/
		arrayBuffer() {
			return this.#cachedBody("arrayBuffer");
		}
		/**
		* `.bytes()` parses the request body as a `Uint8Array`.
		*
		* @see {@link https://hono.dev/docs/api/request#bytes}
		*
		* @example
		* ```ts
		* app.post('/entry', async (c) => {
		*   const body = await c.req.bytes()
		* })
		* ```
		*/
		bytes() {
			return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
		}
		/**
		* Parses the request body as a `Blob`.
		* @example
		* ```ts
		* app.post('/entry', async (c) => {
		*   const body = await c.req.blob();
		* });
		* ```
		* @see https://hono.dev/docs/api/request#blob
		*/
		blob() {
			return this.#cachedBody("blob");
		}
		/**
		* Parses the request body as `FormData`.
		* @example
		* ```ts
		* app.post('/entry', async (c) => {
		*   const body = await c.req.formData();
		* });
		* ```
		* @see https://hono.dev/docs/api/request#formdata
		*/
		formData() {
			return this.#cachedBody("formData");
		}
		/**
		* Adds validated data to the request.
		*
		* @param target - The target of the validation.
		* @param data - The validated data to add.
		*/
		addValidatedData(target, data) {
			(this.#validatedData ??= {})[target] = data;
		}
		valid(target) {
			return this.#validatedData?.[target];
		}
		/**
		* `.url` can get the request url strings.
		*
		* @see {@link https://hono.dev/docs/api/request#url}
		*
		* @example
		* ```ts
		* app.get('/about/me', (c) => {
		*   const url = c.req.url // `http://localhost:8787/about/me`
		*   ...
		* })
		* ```
		*/
		get url() {
			return this.raw.url;
		}
		/**
		* `.method` can get the method name of the request.
		*
		* @see {@link https://hono.dev/docs/api/request#method}
		*
		* @example
		* ```ts
		* app.get('/about/me', (c) => {
		*   const method = c.req.method // `GET`
		* })
		* ```
		*/
		get method() {
			return this.raw.method;
		}
		get [GET_MATCH_RESULT]() {
			return this.#matchResult;
		}
		/**
		* `.matchedRoutes` can return a matched route in the handler
		*
		* @deprecated
		*
		* Use matchedRoutes helper defined in "hono/route" instead.
		*
		* @see {@link https://hono.dev/docs/api/request#matchedroutes}
		*
		* @example
		* ```ts
		* app.use('*', async function logger(c, next) {
		*   await next()
		*   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
		*     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
		*     console.log(
		*       method,
		*       ' ',
		*       path,
		*       ' '.repeat(Math.max(10 - path.length, 0)),
		*       name,
		*       i === c.req.routeIndex ? '<- respond from here' : ''
		*     )
		*   })
		* })
		* ```
		*/
		get matchedRoutes() {
			return this.#matchResult[0].map(([[, route]]) => route);
		}
		/**
		* `.routePath` can retrieve the path registered within the handler
		*
		* @deprecated
		*
		* Use routePath helper defined in "hono/route" instead.
		*
		* @see {@link https://hono.dev/docs/api/request#routepath}
		*
		* @example
		* ```ts
		* app.get('/posts/:id', (c) => {
		*   return c.json({ path: c.req.routePath })
		* })
		* ```
		*/
		get routePath() {
			return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase, raw, resolveCallback;
var init_html = __esmMin((() => {
	HtmlEscapedCallbackPhase = {
		Stringify: 1,
		BeforeStream: 2,
		Stream: 3
	};
	raw = (value, callbacks) => {
		const escapedString = new String(value);
		escapedString.isEscaped = true;
		escapedString.callbacks = callbacks;
		return escapedString;
	};
	resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
		if (typeof str === "object" && !(str instanceof String)) {
			if (!(str instanceof Promise)) str = str.toString();
			if (str instanceof Promise) str = await str;
		}
		const callbacks = str.callbacks;
		if (!callbacks?.length) return Promise.resolve(str);
		if (buffer) buffer[0] += str;
		else buffer = [str];
		const resStr = Promise.all(callbacks.map((c) => c({
			phase,
			buffer,
			context
		}))).then((res) => Promise.all(res.filter(Boolean).map((str) => resolveCallback(str, phase, false, context, buffer))).then(() => buffer[0]));
		if (preserveCallbacks) return raw(await resStr, callbacks);
		else return resStr;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/context.js
var TEXT_PLAIN, setDefaultContentType, createResponseInstance, Context;
var init_context = __esmMin((() => {
	init_request();
	init_html();
	TEXT_PLAIN = "text/plain; charset=UTF-8";
	setDefaultContentType = (contentType, headers) => {
		return {
			"Content-Type": contentType,
			...headers
		};
	};
	createResponseInstance = (body, init) => new Response(body, init);
	Context = class {
		#rawRequest;
		#req;
		/**
		* `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
		*
		* @see {@link https://hono.dev/docs/api/context#env}
		*
		* @example
		* ```ts
		* // Environment object for Cloudflare Workers
		* app.get('*', async c => {
		*   const counter = c.env.COUNTER
		* })
		* ```
		*/
		env = {};
		#var;
		finalized = false;
		/**
		* `.error` can get the error object from the middleware if the Handler throws an error.
		*
		* @see {@link https://hono.dev/docs/api/context#error}
		*
		* @example
		* ```ts
		* app.use('*', async (c, next) => {
		*   await next()
		*   if (c.error) {
		*     // do something...
		*   }
		* })
		* ```
		*/
		error;
		#status;
		#executionCtx;
		#res;
		#layout;
		#renderer;
		#notFoundHandler;
		#preparedHeaders;
		#matchResult;
		#path;
		/**
		* Creates an instance of the Context class.
		*
		* @param req - The Request object.
		* @param options - Optional configuration options for the context.
		*/
		constructor(req, options) {
			this.#rawRequest = req;
			if (options) {
				this.#executionCtx = options.executionCtx;
				this.env = options.env;
				this.#notFoundHandler = options.notFoundHandler;
				this.#path = options.path;
				this.#matchResult = options.matchResult;
			}
		}
		/**
		* `.req` is the instance of {@link HonoRequest}.
		*/
		get req() {
			this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
			return this.#req;
		}
		/**
		* @see {@link https://hono.dev/docs/api/context#event}
		* The FetchEvent associated with the current request.
		*
		* @throws Will throw an error if the context does not have a FetchEvent.
		*/
		get event() {
			if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
			else throw Error("This context has no FetchEvent");
		}
		/**
		* @see {@link https://hono.dev/docs/api/context#executionctx}
		* The ExecutionContext associated with the current request.
		*
		* @throws Will throw an error if the context does not have an ExecutionContext.
		*/
		get executionCtx() {
			if (this.#executionCtx) return this.#executionCtx;
			else throw Error("This context has no ExecutionContext");
		}
		/**
		* @see {@link https://hono.dev/docs/api/context#res}
		* The Response object for the current request.
		*/
		get res() {
			return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
		}
		/**
		* Sets the Response object for the current request.
		*
		* @param _res - The Response object to set.
		*/
		set res(_res) {
			if (this.#res && _res) {
				_res = createResponseInstance(_res.body, _res);
				for (const [k, v] of this.#res.headers.entries()) {
					if (k === "content-type") continue;
					if (k === "set-cookie") {
						const cookies = this.#res.headers.getSetCookie();
						_res.headers.delete("set-cookie");
						for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
					} else _res.headers.set(k, v);
				}
			}
			this.#res = _res;
			this.finalized = true;
		}
		/**
		* `.render()` can create a response within a layout.
		*
		* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
		*
		* @example
		* ```ts
		* app.get('/', (c) => {
		*   return c.render('Hello!')
		* })
		* ```
		*/
		render = (...args) => {
			this.#renderer ??= (content) => this.html(content);
			return this.#renderer(...args);
		};
		/**
		* Sets the layout for the response.
		*
		* @param layout - The layout to set.
		* @returns The layout function.
		*/
		setLayout = (layout) => this.#layout = layout;
		/**
		* Gets the current layout for the response.
		*
		* @returns The current layout function.
		*/
		getLayout = () => this.#layout;
		/**
		* `.setRenderer()` can set the layout in the custom middleware.
		*
		* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
		*
		* @example
		* ```tsx
		* app.use('*', async (c, next) => {
		*   c.setRenderer((content) => {
		*     return c.html(
		*       <html>
		*         <body>
		*           <p>{content}</p>
		*         </body>
		*       </html>
		*     )
		*   })
		*   await next()
		* })
		* ```
		*/
		setRenderer = (renderer) => {
			this.#renderer = renderer;
		};
		/**
		* `.header()` can set headers.
		*
		* @see {@link https://hono.dev/docs/api/context#header}
		*
		* @example
		* ```ts
		* app.get('/welcome', (c) => {
		*   // Set headers
		*   c.header('X-Message', 'Hello!')
		*   c.header('Content-Type', 'text/plain')
		*
		*   // Append multiple headers using the append option (e.g. Vary)
		*   c.header('Vary', 'Accept-Encoding', { append: true })
		*   c.header('Vary', 'User-Agent', { append: true })
		*
		*   return c.body('Thank you for coming')
		* })
		* ```
		*/
		header = (name, value, options) => {
			if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
			const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
			if (value === void 0) headers.delete(name);
			else if (options?.append) headers.append(name, value);
			else headers.set(name, value);
		};
		status = (status) => {
			this.#status = status;
		};
		/**
		* `.set()` can set the value specified by the key.
		*
		* @see {@link https://hono.dev/docs/api/context#set-get}
		*
		* @example
		* ```ts
		* app.use('*', async (c, next) => {
		*   c.set('message', 'Hono is hot!!')
		*   await next()
		* })
		* ```
		*/
		set = (key, value) => {
			this.#var ??= /* @__PURE__ */ new Map();
			this.#var.set(key, value);
		};
		/**
		* `.get()` can use the value specified by the key.
		*
		* @see {@link https://hono.dev/docs/api/context#set-get}
		*
		* @example
		* ```ts
		* app.get('/', (c) => {
		*   const message = c.get('message')
		*   return c.text(`The message is "${message}"`)
		* })
		* ```
		*/
		get = (key) => {
			return this.#var ? this.#var.get(key) : void 0;
		};
		/**
		* `.var` can access the value of a variable.
		*
		* @see {@link https://hono.dev/docs/api/context#var}
		*
		* @example
		* ```ts
		* const result = c.var.client.oneMethod()
		* ```
		*/
		get var() {
			if (!this.#var) return {};
			return Object.fromEntries(this.#var);
		}
		#newResponse(data, arg, headers) {
			let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
			if (typeof arg === "object" && arg.headers) {
				responseHeaders ??= new Headers();
				for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
				else responseHeaders.set(key, value);
			}
			if (headers) {
				if (!responseHeaders) {
					let count = 0;
					for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
						responseHeaders = new Headers();
						break;
					}
				}
				if (responseHeaders) for (const k in headers) {
					const v = headers[k];
					if (typeof v === "string") responseHeaders.set(k, v);
					else {
						responseHeaders.delete(k);
						for (const v2 of v) responseHeaders.append(k, v2);
					}
				}
			}
			const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
			return createResponseInstance(data, {
				status,
				headers: responseHeaders ?? headers
			});
		}
		newResponse = (...args) => this.#newResponse(...args);
		/**
		* `.body()` can return the HTTP response.
		* You can set headers with `.header()` and set HTTP status code with `.status`.
		* This can also be set in `.text()`, `.json()` and so on.
		*
		* @see {@link https://hono.dev/docs/api/context#body}
		*
		* @example
		* ```ts
		* app.get('/welcome', (c) => {
		*   // Set headers
		*   c.header('X-Message', 'Hello!')
		*   c.header('Content-Type', 'text/plain')
		*   // Set HTTP status code
		*   c.status(201)
		*
		*   // Return the response body
		*   return c.body('Thank you for coming')
		* })
		* ```
		*/
		body = (data, arg, headers) => this.#newResponse(data, arg, headers);
		/**
		* `.text()` can render text as `Content-Type:text/plain`.
		*
		* @see {@link https://hono.dev/docs/api/context#text}
		*
		* @example
		* ```ts
		* app.get('/say', (c) => {
		*   return c.text('Hello!')
		* })
		* ```
		*/
		text = (text, arg, headers) => {
			return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
		};
		/**
		* `.json()` can render JSON as `Content-Type:application/json`.
		*
		* @see {@link https://hono.dev/docs/api/context#json}
		*
		* @example
		* ```ts
		* app.get('/api', (c) => {
		*   return c.json({ message: 'Hello!' })
		* })
		* ```
		*/
		json = (object, arg, headers) => {
			return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
		};
		html = (html, arg, headers) => {
			const res = (html) => this.#newResponse(html, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
			return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
		};
		/**
		* `.redirect()` can Redirect, default status code is 302.
		*
		* @see {@link https://hono.dev/docs/api/context#redirect}
		*
		* @example
		* ```ts
		* app.get('/redirect', (c) => {
		*   return c.redirect('/')
		* })
		* app.get('/redirect-permanently', (c) => {
		*   return c.redirect('/', 301)
		* })
		* ```
		*/
		redirect = (location, status) => {
			const locationString = String(location);
			this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
			return this.newResponse(null, status ?? 302);
		};
		/**
		* `.notFound()` can return the Not Found Response.
		*
		* @see {@link https://hono.dev/docs/api/context#notfound}
		*
		* @example
		* ```ts
		* app.get('/notfound', (c) => {
		*   return c.notFound()
		* })
		* ```
		*/
		notFound = () => {
			this.#notFoundHandler ??= () => createResponseInstance();
			return this.#notFoundHandler(this);
		};
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/compose.js
var compose;
var init_compose = __esmMin((() => {
	compose = (middleware, onError, onNotFound) => {
		return (context, next) => {
			let index = -1;
			return dispatch(0);
			/**
			* Dispatch the middleware functions.
			*
			* @param {number} i - The current index in the middleware array.
			*
			* @returns {Promise<Context>} - A promise that resolves to the context.
			*/
			async function dispatch(i) {
				if (i <= index) throw new Error("next() called multiple times");
				index = i;
				let res;
				let isError = false;
				let handler;
				if (middleware[i]) {
					handler = middleware[i][0][0];
					context.req.routeIndex = i;
				} else handler = i === middleware.length && next || void 0;
				if (handler) try {
					res = await handler(context, () => dispatch(i + 1));
				} catch (err) {
					if (err instanceof Error && onError) {
						context.error = err;
						res = await onError(err, context);
						isError = true;
					} else throw err;
				}
				else if (context.finalized === false && onNotFound) res = await onNotFound(context);
				if (res && (context.finalized === false || isError)) context.res = res;
				return context;
			}
		};
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router.js
var METHODS, MESSAGE_MATCHER_IS_ALREADY_BUILT, UnsupportedPathError;
var init_router$3 = __esmMin((() => {
	METHODS = [
		"get",
		"post",
		"put",
		"delete",
		"options",
		"patch",
		"query"
	];
	MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
	UnsupportedPathError = class extends Error {};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER;
var init_constants$1 = __esmMin((() => {
	COMPOSED_HANDLER = "__COMPOSED_HANDLER";
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/hono-base.js
var notFoundHandler, errorHandler, Hono$1;
var init_hono_base = __esmMin((() => {
	init_compose();
	init_url();
	init_context();
	init_router$3();
	init_constants$1();
	notFoundHandler = (c) => {
		return c.text("404 Not Found", 404);
	};
	errorHandler = (err, c) => {
		if ("getResponse" in err) {
			const res = err.getResponse();
			return c.newResponse(res.body, res);
		}
		console.error(err);
		return c.text("Internal Server Error", 500);
	};
	Hono$1 = class Hono {
		get;
		post;
		put;
		delete;
		options;
		patch;
		query;
		all;
		on;
		use;
		router;
		getPath;
		_basePath = "/";
		#path = "/";
		routes = [];
		constructor(options = {}) {
			[...METHODS, "all"].forEach((method) => {
				this[method] = (args1, ...args) => {
					const methodName = method.toUpperCase();
					if (typeof args1 === "string") this.#path = args1;
					else this.#addRoute(methodName, this.#path, args1);
					args.forEach((handler) => {
						this.#addRoute(methodName, this.#path, handler);
					});
					return this;
				};
			});
			this.on = (method, path, ...handlers) => {
				for (const p of [path].flat()) {
					this.#path = p;
					for (const m of [method].flat()) {
						const methodName = m.toUpperCase();
						for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
					}
				}
				return this;
			};
			this.use = (arg1, ...handlers) => {
				if (typeof arg1 === "string") this.#path = arg1;
				else {
					this.#path = "*";
					handlers.unshift(arg1);
				}
				handlers.forEach((handler) => {
					this.#addRoute("ALL", this.#path, handler);
				});
				return this;
			};
			const { strict, ...optionsWithoutStrict } = options;
			Object.assign(this, optionsWithoutStrict);
			this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
		}
		#clone() {
			const clone = new Hono({
				router: this.router,
				getPath: this.getPath
			});
			clone.errorHandler = this.errorHandler;
			clone.#notFoundHandler = this.#notFoundHandler;
			clone.routes = this.routes;
			return clone;
		}
		#notFoundHandler = notFoundHandler;
		errorHandler = errorHandler;
		/**
		* `.route()` allows grouping other Hono instance in routes.
		*
		* @see {@link https://hono.dev/docs/api/routing#grouping}
		*
		* @param {string} path - base Path
		* @param {Hono} app - other Hono instance
		* @returns {Hono} routed Hono instance
		*
		* @example
		* ```ts
		* const app = new Hono()
		* const app2 = new Hono()
		*
		* app2.get("/user", (c) => c.text("user"))
		* app.route("/api", app2) // GET /api/user
		* ```
		*/
		route(path, app) {
			const subApp = this.basePath(path);
			app.routes.map((r) => {
				let handler;
				if (app.errorHandler === errorHandler) handler = r.handler;
				else {
					handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
					handler[COMPOSED_HANDLER] = r.handler;
				}
				subApp.#addRoute(r.method, r.path, handler, r.basePath);
			});
			return this;
		}
		/**
		* `.basePath()` allows base paths to be specified.
		*
		* @see {@link https://hono.dev/docs/api/routing#base-path}
		*
		* @param {string} path - base Path
		* @returns {Hono} changed Hono instance
		*
		* @example
		* ```ts
		* const api = new Hono().basePath('/api')
		* ```
		*/
		basePath(path) {
			const subApp = this.#clone();
			subApp._basePath = mergePath(this._basePath, path);
			return subApp;
		}
		/**
		* `.onError()` handles an error and returns a customized Response.
		*
		* @see {@link https://hono.dev/docs/api/hono#error-handling}
		*
		* @param {ErrorHandler} handler - request Handler for error
		* @returns {Hono} changed Hono instance
		*
		* @example
		* ```ts
		* app.onError((err, c) => {
		*   console.error(`${err}`)
		*   return c.text('Custom Error Message', 500)
		* })
		* ```
		*/
		onError = (handler) => {
			this.errorHandler = handler;
			return this;
		};
		/**
		* `.notFound()` allows you to customize a Not Found Response.
		*
		* @see {@link https://hono.dev/docs/api/hono#not-found}
		*
		* @param {NotFoundHandler} handler - request handler for not-found
		* @returns {Hono} changed Hono instance
		*
		* @example
		* ```ts
		* app.notFound((c) => {
		*   return c.text('Custom 404 Message', 404)
		* })
		* ```
		*/
		notFound = (handler) => {
			this.#notFoundHandler = handler;
			return this;
		};
		/**
		* `.mount()` allows you to mount applications built with other frameworks into your Hono application.
		*
		* @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
		*
		* @see {@link https://hono.dev/docs/api/hono#mount}
		*
		* @param {string} path - base Path
		* @param {Function} applicationHandler - other Request Handler
		* @param {MountOptions} [options] - options of `.mount()`
		* @returns {Hono} mounted Hono instance
		*
		* @example
		* ```ts
		* import { Router as IttyRouter } from 'itty-router'
		* import { Hono } from 'hono'
		* // Create itty-router application
		* const ittyRouter = IttyRouter()
		* // GET /itty-router/hello
		* ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
		*
		* const app = new Hono()
		* app.mount('/itty-router', ittyRouter.handle)
		* ```
		*
		* @example
		* ```ts
		* const app = new Hono()
		* // Send the request to another application without modification.
		* app.mount('/app', anotherApp, {
		*   replaceRequest: (req) => req,
		* })
		* ```
		*/
		mount(path, applicationHandler, options) {
			let replaceRequest;
			let optionHandler;
			if (options) {
				if (typeof options === "function") optionHandler = options;
				else {
					optionHandler = options.optionHandler;
					if (options.replaceRequest === false) replaceRequest = (request) => request;
					else replaceRequest = options.replaceRequest;
				}
			}
			const getOptions = optionHandler ? (c) => {
				const options = optionHandler(c);
				return Array.isArray(options) ? options : [options];
			} : (c) => {
				let executionContext = void 0;
				try {
					executionContext = c.executionCtx;
				} catch {}
				return [c.env, executionContext];
			};
			replaceRequest ||= (() => {
				const mergedPath = mergePath(this._basePath, path);
				const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
				return (request) => {
					const url = new URL(request.url);
					url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
					return new Request(url, request);
				};
			})();
			const handler = async (c, next) => {
				const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
				if (res) return res;
				await next();
			};
			this.#addRoute("ALL", mergePath(path, "*"), handler);
			return this;
		}
		#addRoute(method, path, handler, baseRoutePath) {
			path = mergePath(this._basePath, path);
			const r = {
				basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
				path,
				method,
				handler
			};
			this.router.add(method, path, [handler, r]);
			this.routes.push(r);
		}
		#handleError(err, c) {
			if (err instanceof Error) return this.errorHandler(err, c);
			throw err;
		}
		#dispatch(request, executionCtx, env, method) {
			if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
			const path = this.getPath(request, { env });
			const matchResult = this.router.match(method, path);
			const c = new Context(request, {
				path,
				matchResult,
				env,
				executionCtx,
				notFoundHandler: this.#notFoundHandler
			});
			if (matchResult[0].length === 1) {
				let res;
				try {
					res = matchResult[0][0][0][0](c, async () => {
						c.res = await this.#notFoundHandler(c);
					});
				} catch (err) {
					return this.#handleError(err, c);
				}
				return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
			}
			const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
			return (async () => {
				try {
					const context = await composed(c);
					if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
					return context.res;
				} catch (err) {
					return this.#handleError(err, c);
				}
			})();
		}
		/**
		* `.fetch()` will be entry point of your app.
		*
		* @see {@link https://hono.dev/docs/api/hono#fetch}
		*
		* @param {Request} request - request Object of request
		* @param {Env} env - env Object
		* @param {ExecutionContext} executionCtx - context of execution
		* @returns {Response | Promise<Response>} response of request
		*
		*/
		fetch = (request, ...rest) => {
			return this.#dispatch(request, rest[1], rest[0], request.method);
		};
		/**
		* `.request()` is a useful method for testing.
		* You can pass a URL or pathname to send a GET request.
		* app will return a Response object.
		* ```ts
		* test('GET /hello is ok', async () => {
		*   const res = await app.request('/hello')
		*   expect(res.status).toBe(200)
		* })
		* ```
		* @see https://hono.dev/docs/api/hono#request
		*/
		request = (input, requestInit, Env, executionCtx) => {
			if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
			input = input.toString();
			return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
		};
		/**
		* `.fire()` automatically adds a global fetch event listener.
		* This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
		* @deprecated
		* Use `fire` from `hono/service-worker` instead.
		* ```ts
		* import { Hono } from 'hono'
		* import { fire } from 'hono/service-worker'
		*
		* const app = new Hono()
		* // ...
		* fire(app)
		* ```
		* @see https://hono.dev/docs/api/hono#fire
		* @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
		* @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
		*/
		fire = () => {
			addEventListener("fetch", (event) => {
				event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
			});
		};
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/utils.js
var createNullObject;
var init_utils = __esmMin((() => {
	createNullObject = () => Object.create(null);
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/reg-exp-router/matcher.js
function match(method, path) {
	const matchers = this.buildAllMatchers();
	const match = ((method, path) => {
		const matcher = matchers[method] || matchers["ALL"];
		const staticMatch = matcher[2][path];
		if (staticMatch) return staticMatch;
		const match = path.match(matcher[0]);
		if (!match) return [[], emptyParam];
		const index = match.indexOf("", 1);
		return [matcher[1][index], match];
	});
	this.match = match;
	return match(method, path);
}
var emptyParam;
var init_matcher = __esmMin((() => {
	emptyParam = [];
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/reg-exp-router/node.js
/**
* Sort order:
* 1. literal
* 2. special pattern (e.g. :label{[0-9]+})
* 3. common label pattern (e.g. :label)
* 4. wildcard
*/
function compareKey(a, b) {
	if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
	if (b.length === 1) return 1;
	if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
	else if (b === ".*" || b === "(?:|/.*)") return -1;
	if (a === "[^/]+") return 1;
	else if (b === "[^/]+") return -1;
	return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var LABEL_REG_EXP_STR, TAIL_WILDCARD_REG_EXP_STR, PATH_ERROR, regExpMetaChars, Node$1;
var init_node$1 = __esmMin((() => {
	init_utils();
	LABEL_REG_EXP_STR = "[^/]+";
	TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
	PATH_ERROR = Symbol();
	regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
	Node$1 = class Node {
		#index;
		#varIndex;
		#children = createNullObject();
		insert(tokens, index, paramMap, context, isStatic) {
			let node = this;
			for (let i = 0, len = tokens.length; i < len; i++) {
				const token = tokens[i];
				const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
					"",
					"",
					".*"
				] : [
					"",
					"",
					LABEL_REG_EXP_STR
				] : null : token === "/*" ? [
					"",
					"",
					TAIL_WILDCARD_REG_EXP_STR
				] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
				let nextNode;
				if (pattern) {
					const name = pattern[1];
					let regexpStr = pattern[2] || "[^/]+";
					if (name && pattern[2]) {
						if (regexpStr === ".*") throw PATH_ERROR;
						regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
						if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
						if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
					}
					nextNode = node.#children[regexpStr];
					if (!nextNode) {
						if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
							for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
						}
						nextNode = node.#children[regexpStr] = new Node();
					}
					if (name !== "") {
						nextNode.#varIndex ??= context.varIndex++;
						paramMap.push([name, nextNode.#varIndex]);
					}
				} else {
					nextNode = node.#children[token];
					if (!nextNode) {
						for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
						nextNode = node.#children[token] = new Node();
					}
				}
				node = nextNode;
			}
			if (node.#index !== void 0) throw PATH_ERROR;
			node.#index = isStatic ? -1 : index;
		}
		buildRegExpStr() {
			const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
				const c = this.#children[k];
				const childStr = c.buildRegExpStr();
				return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
			}).filter(Boolean);
			if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
			if (strList.length === 0) return "";
			if (strList.length === 1) return strList[0];
			return "(?:" + strList.join("|") + ")";
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie;
var init_trie = __esmMin((() => {
	init_utils();
	init_node$1();
	Trie = class {
		#context = { varIndex: 0 };
		#root = new Node$1();
		#index = 0;
		paths = createNullObject();
		insert(path, isStatic) {
			if (isStatic) {
				this.#root.insert(path.split(""), 0, [], this.#context, true);
				return;
			}
			const paramAssoc = [];
			const groups = [];
			let markedPath = path;
			for (let i = 0;;) {
				let replaced = false;
				markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
					const mark = `@\\${i}`;
					groups[i] = [mark, m];
					i++;
					replaced = true;
					return mark;
				});
				if (!replaced) break;
			}
			/**
			*  - pattern (:label, :label{0-9]+}, ...)
			*  - /* wildcard
			*  - character
			*/
			const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
			for (let i = groups.length - 1; i >= 0; i--) {
				const [mark] = groups[i];
				for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
					tokens[j] = tokens[j].replace(mark, groups[i][1]);
					break;
				}
			}
			this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
			this.paths[path] = [this.#index++, paramAssoc];
		}
		buildRegExp() {
			let regexp = this.#root.buildRegExpStr();
			if (regexp === "") return [
				/^$/,
				[],
				[]
			];
			let captureIndex = 0;
			const indexReplacementMap = [];
			const paramReplacementMap = [];
			regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
				if (handlerIndex !== void 0) {
					indexReplacementMap[++captureIndex] = Number(handlerIndex);
					return "$()";
				}
				if (paramIndex !== void 0) {
					paramReplacementMap[Number(paramIndex)] = ++captureIndex;
					return "";
				}
				return "";
			});
			return [
				new RegExp(`^${regexp}`),
				indexReplacementMap,
				paramReplacementMap
			];
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/reg-exp-router/router.js
function buildWildcardRegExp(path) {
	return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match, metaChar) => metaChar ? `\\${metaChar}` : match === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path) {
	for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
var wildcardRegExpCache, RegExpRouter;
var init_router$2 = __esmMin((() => {
	init_url();
	init_router$3();
	init_utils();
	init_matcher();
	init_node$1();
	init_trie();
	wildcardRegExpCache = createNullObject();
	RegExpRouter = class {
		name = "RegExpRouter";
		#middleware;
		#routes;
		#tries;
		constructor() {
			this.#middleware = { ["ALL"]: createNullObject() };
			this.#routes = { ["ALL"]: createNullObject() };
			this.#tries = { ["ALL"]: new Trie() };
		}
		#insertPath(method, path) {
			try {
				this.#tries[method].insert(path, !/\*|\/:/.test(path));
			} catch (e) {
				throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
			}
		}
		add(method, path, handler) {
			const middleware = this.#middleware;
			const routes = this.#routes;
			if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
			if (!middleware[method]) {
				this.#tries[method] = new Trie();
				for (const handlerMap of [middleware, routes]) {
					handlerMap[method] = createNullObject();
					for (const p in handlerMap["ALL"]) {
						handlerMap[method][p] = [...handlerMap["ALL"][p]];
						this.#insertPath(method, p);
					}
				}
			}
			if (path === "/*") path = "*";
			const methods = method === "ALL" ? Object.keys(middleware) : [method];
			if (/\*$/.test(path)) {
				const re = buildWildcardRegExp(path);
				for (const m of methods) if (!middleware[m][path]) {
					this.#insertPath(m, path);
					middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
				}
				for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
				return;
			}
			const paths = checkOptionalParameter(path) || [path];
			for (const path of paths) for (const m of methods) {
				if (!routes[m][path]) {
					this.#insertPath(m, path);
					routes[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
				}
				routes[m][path].push([handler, path]);
			}
		}
		match = match;
		buildAllMatchers() {
			const matchers = createNullObject();
			for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
			this.#middleware = this.#routes = this.#tries = void 0;
			wildcardRegExpCache = createNullObject();
			return matchers;
		}
		#buildMatcher(method) {
			const middleware = this.#middleware[method];
			const routes = this.#routes[method];
			const trie = this.#tries[method];
			const staticMap = createNullObject();
			const handlerData = [];
			const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
			for (const r of [middleware, routes]) for (const path in r) {
				const handlers = r[path];
				const pathData = trie.paths[path];
				if (!pathData) {
					staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
					continue;
				}
				handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
					map[key] = paramReplacementMap[pathData[1][i][1]];
					return map;
				}, createNullObject())]);
			}
			return [
				regexp,
				indexReplacementMap.map((i) => handlerData[i]),
				staticMap
			];
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/reg-exp-router/prepared-router.js
var init_prepared_router = __esmMin((() => {
	init_router$2();
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/reg-exp-router/index.js
var init_reg_exp_router = __esmMin((() => {
	init_router$2();
	init_prepared_router();
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/smart-router/router.js
var SmartRouter;
var init_router$1 = __esmMin((() => {
	init_router$3();
	SmartRouter = class {
		name = "SmartRouter";
		#routers = [];
		#routes = [];
		constructor(init) {
			this.#routers = init.routers;
		}
		add(method, path, handler) {
			if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
			this.#routes.push([
				method,
				path,
				handler
			]);
		}
		match(method, path) {
			if (!this.#routes) throw new Error("Fatal error");
			const routers = this.#routers;
			const routes = this.#routes;
			const len = routers.length;
			let i = 0;
			let res;
			for (; i < len; i++) {
				const router = routers[i];
				try {
					for (let i = 0, len = routes.length; i < len; i++) router.add(...routes[i]);
					res = router.match(method, path);
				} catch (e) {
					if (e instanceof UnsupportedPathError) continue;
					throw e;
				}
				this.match = router.match.bind(router);
				this.#routers = [router];
				this.#routes = void 0;
				break;
			}
			if (i === len) throw new Error("Fatal error");
			this.name = `SmartRouter + ${this.activeRouter.name}`;
			return res;
		}
		get activeRouter() {
			if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
			return this.#routers[0];
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/trie-router/node.js
var emptyParams, order, Node;
var init_node = __esmMin((() => {
	init_url();
	init_utils();
	emptyParams = createNullObject();
	order = 0;
	Node = class Node {
		#methods = [];
		#children = createNullObject();
		#patterns = [];
		#pattern;
		#params = emptyParams;
		insert(method, path, handler) {
			let curNode = this;
			const parts = splitRoutingPath(path);
			const possibleKeys = /* @__PURE__ */ new Set();
			let i = 0;
			for (const p of parts) {
				const nextP = parts[++i];
				const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
				const isParam = Array.isArray(pattern);
				const key = isParam ? pattern[0] : pattern || p;
				const child = curNode.#children[key] ||= new Node();
				if (pattern && !child.#pattern) {
					child.#pattern = pattern;
					curNode.#patterns.push(child);
				}
				curNode = child;
				if (isParam) possibleKeys.add(pattern[1]);
			}
			curNode.#methods.push({ [method]: {
				handler,
				possibleKeys: [...possibleKeys],
				score: ++order
			} });
		}
		#pushHandlerSets(handlerSets, node, method, nodeParams, params) {
			for (let i = 0, len = node.#methods.length; i < len; i++) {
				const m = node.#methods[i];
				const handlerSet = m[method] || m["ALL"];
				if (handlerSet) {
					handlerSet.params = createNullObject();
					handlerSets.push(handlerSet);
					for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
						const key = handlerSet.possibleKeys[i];
						handlerSet.params[key] = params?.[key] && !i ? params[key] : nodeParams[key] ?? params?.[key];
					}
				}
			}
		}
		search(method, path) {
			const handlerSets = [];
			this.#params = emptyParams;
			let curNodes = [this];
			const parts = splitPath(path);
			const curNodesQueue = [];
			const len = parts.length;
			let partOffsets = null;
			for (let i = 0; i < len; i++) {
				const part = parts[i];
				const isLast = i === len - 1;
				const tempNodes = [];
				for (let j = 0, len2 = curNodes.length; j < len2; j++) {
					const node = curNodes[j];
					const nextNode = node.#children[part];
					if (nextNode) {
						nextNode.#params = node.#params;
						if (isLast) {
							if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
							this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
						} else tempNodes.push(nextNode);
					}
					for (const child of node.#patterns) {
						const pattern = child.#pattern;
						const params = node.#params === emptyParams ? {} : { ...node.#params };
						if (typeof pattern === "string") {
							if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
								this.#pushHandlerSets(handlerSets, child, method, node.#params);
								if (pattern === "*") {
									child.#params = params;
									tempNodes.push(child);
								}
							}
							continue;
						}
						const [, name, matcher] = pattern;
						if (!part && matcher === true) continue;
						if (matcher !== true) {
							if (!partOffsets) {
								partOffsets = [];
								let offset = path[0] === "/" ? 1 : 0;
								for (let p = 0; p < len; p++) {
									partOffsets[p] = offset;
									offset += parts[p].length + 1;
								}
							}
							const restPathString = path.slice(partOffsets[i]);
							const m = matcher.exec(restPathString);
							if (m) {
								params[name] = m[0];
								this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
								if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
								for (const _ in child.#children) {
									child.#params = params;
									const componentCount = m[0].match(/\//g)?.length ?? 0;
									(curNodesQueue[componentCount] ||= []).push(child);
									break;
								}
								continue;
							}
						}
						if (matcher === true || matcher.test(part)) {
							params[name] = part;
							if (isLast) {
								this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
								if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
							} else {
								child.#params = params;
								tempNodes.push(child);
							}
						}
					}
				}
				const shifted = curNodesQueue.shift();
				curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
			}
			if (handlerSets[1]) handlerSets.sort((a, b) => {
				return a.score - b.score;
			});
			return [handlerSets.map(({ handler, params }) => [handler, params])];
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/trie-router/router.js
var TrieRouter;
var init_router = __esmMin((() => {
	init_url();
	init_node();
	TrieRouter = class {
		name = "TrieRouter";
		#node = new Node();
		add(method, path, handler) {
			for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
		}
		match(method, path) {
			return this.#node.search(method, path);
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/router/trie-router/index.js
var init_trie_router = __esmMin((() => {
	init_router();
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/hono.js
var Hono;
var init_hono$1 = __esmMin((() => {
	init_hono_base();
	init_router$2();
	init_reg_exp_router();
	init_router$1();
	init_router();
	init_trie_router();
	Hono = class extends Hono$1 {
		/**
		* Creates an instance of the Hono class.
		*
		* @param options - Optional configuration options for the Hono instance.
		*/
		constructor(options = {}) {
			super(options);
			this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/index.js
var init_dist$2 = __esmMin((() => {
	init_hono$1();
}));
//#endregion
//#region ../core/dist/build.js
function buildSlot() {
	const scope = globalThis;
	const existing = scope[BUILD_KEY];
	if (existing !== void 0) return existing;
	const slot = { build: null };
	scope[BUILD_KEY] = slot;
	return slot;
}
/**
* Registers the build Hum runs from and returns it, so a generated module can
* both register its build and export it:
*
* ```js
* export const build = defineBuild({
*   routes: manifest.routes,
*   islands: manifest.islands,
*   prod: null,
* });
* ```
*
* Importing that module is what hands the runtime its input, which is why
* `mountHum` takes no routes, islands or production assets of its own.
*/
function defineBuild(build) {
	buildSlot().build = build;
	return build;
}
/**
* The registered build.
*
* A mounted app keeps the build it was mounted with, so registering another one
* later does not disturb it.
*/
function humBuild() {
	const { build } = buildSlot();
	if (build === null) throw new TypeError(BUILD_REQUIRED);
	return build;
}
var BUILD_KEY, BUILD_REQUIRED;
var init_build = __esmMin((() => {
	BUILD_KEY = Symbol.for("hum.build");
	BUILD_REQUIRED = "hum: no build registered. Import the module the Vite plugin generated (`virtual:hum/build`), which calls `defineBuild` with the routes, the islands and the production assets; when mounting Hum yourself, call `defineBuild` with the result of `specsFromGlob` from `@humjs/core/routing`.";
}));
//#endregion
//#region ../core/dist/config.js
function resolveConfig(config) {
	const root = resolve(config.root ?? process.cwd());
	let basePath = config.basePath ?? "/";
	if (basePath !== "/" && basePath.endsWith("/")) basePath = basePath.slice(0, -1);
	if (basePath === "/") basePath = "";
	const outDir = config.outDir ?? "dist";
	return {
		root,
		routesDir: config.routesDir ?? "routes",
		islandsDir: config.islandsDir ?? "islands",
		outDir,
		basePath,
		dev: config.dev ?? true,
		logger: config.logger ?? defaultLogger
	};
}
var ASSETS_BASE, RUNTIME_URL, defaultLogger;
var init_config = __esmMin((() => {
	ASSETS_BASE = "/_hum";
	RUNTIME_URL = `${ASSETS_BASE}/runtime.js`;
	defaultLogger = {
		info: (...args) => console.log("hum:", ...args),
		warn: (...args) => console.warn("hum:", ...args),
		error: (...args) => console.error("hum:", ...args),
		debug: (...args) => {
			if (process.env.HUM_DEBUG) console.log("hum:", ...args);
		}
	};
}));
//#endregion
//#region ../core/dist/runtime/shared_internal.js
/**
* Keys end up inside comment markers, which are split on `:`. Replace the
* separator so a user supplied key can never break marker parsing.
*/
function normalizeKey(key) {
	if (key === void 0 || key === null) return "";
	return (typeof key === "string" ? key : String(key)).replaceAll(":", "_");
}
function islandMarker(name, propsIdx, key) {
	return `${MARKER_PREFIX}island:${name}:${propsIdx}:${key}`;
}
function slotMarker(id, name) {
	return `${MARKER_PREFIX}slot:${id}:${name}`;
}
function partialMarker(name, mode, key) {
	return `${MARKER_PREFIX}partial:${name}:${mode}:${key}`;
}
/**
* Marker bracketing a page level signal rendered as a child
* (`<p>{count}</p>`). The index addresses the payload entry holding the
* signal.
*/
function signalMarker(index) {
	return `${MARKER_PREFIX}signal:${index}`;
}
/**
* Compares the currently rendered pathname with a link's `href`, used to mark
* the active/ancestor navigation links.
*/
function matchesUrl(current, needle, currentSearch) {
	const needleUrl = new URL(needle, "http://localhost");
	let href = needleUrl.pathname;
	const needleSearch = needleUrl.search;
	if (href !== "/" && href.endsWith("/")) href = href.slice(0, -1);
	if (current !== "/" && current.endsWith("/")) current = current.slice(0, -1);
	if (current === href) {
		if (needleSearch && currentSearch !== void 0 && needleSearch !== currentSearch) return UrlMatchKind.Ancestor;
		return UrlMatchKind.Current;
	} else if (current.startsWith(href + "/") || href === "/") return UrlMatchKind.Ancestor;
	return UrlMatchKind.None;
}
/** Marks the active / ancestor link in a server rendered or hydrated tree. */
function setActiveUrl(vnode, pathname, search) {
	const props = vnode.props;
	const hrefProp = props.href;
	if (typeof hrefProp !== "string" || !hrefProp.startsWith("/")) return;
	if (props["aria-current"] !== void 0) return;
	const match = matchesUrl(pathname, hrefProp, search);
	if (match === UrlMatchKind.Current) {
		props["data-current"] = "true";
		props["aria-current"] = "page";
	} else if (match === UrlMatchKind.Ancestor) {
		props["data-ancestor"] = "true";
		props["aria-current"] = "true";
	}
}
/**
* Escapes a value so it can be embedded safely in an inline `<script>`. The
* characters that could terminate the script element or open an HTML comment
* are escaped, and `</` is broken up.
*/
function escapeScript(value) {
	return value.replaceAll("</", "<\\/").replaceAll("<!--", "<\\!--").replaceAll("-->", "--\\>").replaceAll("<script", "<\\script").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}
/** Internal: keeps `asset()` in sync with the running build. */
function setBuildId(id) {
	BUILD_ID = id;
}
var MARKER_PREFIX, CLIENT_NAV_ATTR, DATA_HUM_KEY, PARTIAL_SEARCH_PARAM, PARTIAL_STATE_ID, FACET_SIGNAL_ATTR, FACET_HANDLER_ATTR, OptionsType, PartialMode, UrlMatchKind, BUILD_ID;
var init_shared_internal = __esmMin((() => {
	MARKER_PREFIX = "hum:";
	CLIENT_NAV_ATTR = "data-hum-client-nav";
	DATA_HUM_KEY = "data-hum-key";
	PARTIAL_SEARCH_PARAM = "_hum_partial";
	PARTIAL_STATE_ID = "__HUM_STATE__";
	FACET_SIGNAL_ATTR = "data-hum-signal";
	FACET_HANDLER_ATTR = "data-hum-handler";
	OptionsType = {
		ATTR: "attr",
		VNODE: "vnode",
		DIFF: "__b",
		RENDER: "__r",
		DIFFED: "diffed",
		ERROR: "__e",
		COMMIT: "__c",
		ROOT: "__"
	};
	PartialMode = {
		Replace: 0,
		Append: 1,
		Prepend: 2
	};
	UrlMatchKind = {
		None: 0,
		Ancestor: 1,
		Current: 2
	};
}));
//#endregion
//#region ../core/dist/build_cache.js
var BuildCache;
var init_build_cache = __esmMin((() => {
	init_config();
	init_shared_internal();
	BuildCache = class {
		/** Islands by name, as their markers and the boot script name them. */
		islands = /* @__PURE__ */ new Map();
		/** URL of the client runtime entry, imported by the boot script. */
		clientEntry;
		/** Stylesheets that belong to the client entry itself. */
		entryAssets = [];
		buildId = "dev";
		dev;
		/**
		* URL prefix the client assets are published under. It is the build's when a
		* build registered one, and the framework constant otherwise: there is no
		* configuration that could set it.
		*/
		#assetsBase;
		constructor(dev) {
			this.dev = dev;
			this.#assetsBase = ASSETS_BASE;
			this.clientEntry = dev ? RUNTIME_URL : "";
		}
		/** (Re)builds the island table from the build's manifest. */
		load(build) {
			const prod = this.dev ? null : build.prod;
			this.islands.clear();
			this.#assetsBase = (prod?.assetsBase ?? "/_hum").replace(/\/+$/, "");
			for (const spec of build.islands) {
				const prodInfo = prod?.islands[spec.name];
				const island = {
					name: spec.name,
					exportName: spec.exportName,
					file: spec.file,
					clientUrl: prodInfo === void 0 ? `/${spec.file}` : this.#assetUrl(prodInfo.file),
					css: (prodInfo?.css ?? []).map((css) => this.#assetUrl(css))
				};
				this.islands.set(island.name, island);
			}
			if (!this.dev && prod !== null) {
				this.clientEntry = this.#assetUrl(prod.clientEntry);
				this.entryAssets = (prod.entryAssets ?? []).map((asset) => this.#assetUrl(asset));
				this.buildId = prod.buildId;
				setBuildId(prod.buildId);
			}
		}
		/** Turns a path relative to the assets base into a public URL. */
		#assetUrl(file) {
			if (file.startsWith("/")) return file;
			return `${this.#assetsBase}/${file}`;
		}
		getIsland(name) {
			return this.islands.get(name);
		}
	};
}));
//#endregion
//#region ../core/dist/error.js
var HttpError, RouteLoadError;
var init_error = __esmMin((() => {
	HttpError = class extends Error {
		name = "HttpError";
		status;
		constructor(status, message, options) {
			super(message ?? `HTTP error ${status}`, options);
			this.status = status;
		}
	};
	RouteLoadError = class extends Error {
		name = "RouteLoadError";
		constructor(file, cause) {
			super(`Failed to load route module "${file}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
		}
	};
}));
//#endregion
//#region ../core/dist/loader.js
var ModuleLoader;
var init_loader = __esmMin((() => {
	init_error();
	ModuleLoader = class {
		dev;
		#cache = /* @__PURE__ */ new Map();
		constructor(dev) {
			this.dev = dev;
		}
		load(source) {
			if (!this.dev) {
				const cached = this.#cache.get(source.file);
				if (cached !== void 0) return cached;
			}
			const promise = source.load().catch((err) => {
				this.#cache.delete(source.file);
				throw new RouteLoadError(source.file, err);
			});
			if (!this.dev) this.#cache.set(source.file, promise);
			return promise;
		}
		clear() {
			this.#cache.clear();
		}
	};
}));
//#endregion
//#region ../core/dist/request_context.js
/**
* Runs `fn` with a request-scoped context so that module-level helpers such as
* {@link page} know which route they belong to. AsyncLocalStorage keeps each
* concurrent request isolated — the store is only visible within that request's
* async chain.
*/
function runWithRequestContext(ctx, fn) {
	return storage.run(ctx, fn);
}
var globalRef$1, storage, page;
var init_request_context = __esmMin((() => {
	globalRef$1 = globalThis;
	storage = globalRef$1.__humRequestContext ?? (globalRef$1.__humRequestContext = new AsyncLocalStorage());
	page = (data, options) => {
		const ctx = storage.getStore();
		if (ctx === void 0) throw new Error("hum: `page` can only be called from within a route handler. To render outside of one, use `renderRoute` directly.");
		return ctx.page(data, options);
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/preact@11.0.1_preact-render-to-string@6.8.0/node_modules/preact/dist/preact.mjs
function _$4(n) {
	n && n.parentNode && n.remove();
}
function g$5(n, t, i) {
	var r, u, f, o = {}, e = arguments.length;
	for (f in t) "key" == f ? r = t[f] : "ref" == f && "function" != typeof n ? u = t[f] : o[f] = t[f];
	return e > 2 && (o.children = e > 3 ? d$4.call(arguments, 2) : i), b$5(n, o, r, u, null);
}
function b$5(i, r, u, f, o) {
	var e = {
		type: i,
		props: r,
		key: u,
		ref: f,
		__k: null,
		__: null,
		__b: 0,
		__e: null,
		__c: null,
		constructor: void 0,
		__v: o || ++t$2,
		__i: -1,
		__u: 0
	};
	return !o && n$2.vnode && n$2.vnode(e), e;
}
function M$2(n) {
	return n.children;
}
function $$3(n, t) {
	this.props = n, this.context = t, this.__g = 0;
}
function x$5(n, t) {
	if (null == t) return n.__ ? x$5(n.__, n.__i + 1) : null;
	for (var i; t < n.__k.length; t++) if ((i = n.__k[t]) && i.__e) return i.__e;
	return "function" != typeof n.type || n.props.__P ? null : x$5(n);
}
function S$2(n) {
	if ((n = n.__) && n.__c && !n.props.__P) return n.__e = null, n.__k.some(function(t) {
		return t && (n.__e = t.__e);
	}), S$2(n);
}
function C$2(t) {
	(8 & t.__g || !(t.__g |= 8) || !r$3.push(t) || f$5++) && u$5 == n$2.debounceRendering || ((u$5 = n$2.debounceRendering) || queueMicrotask)(j$3);
}
function j$3() {
	var t, i, u, e, l, c, a, s, h;
	try {
		for (i = 1; r$3.length;) r$3.length > i && r$3.sort(o$5), t = r$3.shift(), i = r$3.length, 8 & t.__g && (e = void 0, l = void 0, c = (l = (u = t).__v).__e, a = [], s = [], (h = u.__P) && ((e = w$5({ constructor: void 0 }, l)).__v = l.__v + 1, n$2.vnode && n$2.vnode(e), N$2(h, e, l, u.__n, h.namespaceURI, 32 & l.__u ? [c] : null, a, c || x$5(l), 32 & l.__u, s), e.__v = l.__v, e.__.__k[e.__i] = e, z$3(a, e, s), l.__ = l.__e = null, e.__e != c && S$2(e)));
	} finally {
		r$3.length = f$5 = 0;
	}
}
function L$2(n, t, i, r, u, f, o, e, l, c, a) {
	var s, v, y, d, w, _, g = r.__k || p$5, k = t.length;
	for (l = H$2(i, t, g, l, k), s = 0; s < k; s++) null != (y = i.__k[s]) && (v = ~y.__i && g[y.__i] || h$5, y.__i = s, _ = N$2(n, y, v, u, f, o, e, l, c, a), d = y.__e, (v.ref != y.ref || 8 & v.__u) && (v.ref && D$2(v.ref, null, y, v), y.ref && a.push(y.ref, y.__c || d, y)), w = w || d, 4 & y.__u ? (l = I$1(y, l, n, !v.__v), v.__e && (v.__e = null)) : "function" == typeof y.type && void 0 !== _ ? l = _ : d && (l = d.nextSibling), y.__u &= -7);
	return i.__e = w, l;
}
function H$2(n, t, i, r, u) {
	var f, o, e, l, c, a, s, h, p, v, d = i.length, w = d, _ = 0, g = !1, k = n.__k = Array(u);
	for (f = 0; f < u; f++) null != (o = t[f]) && "boolean" != typeof o && "function" != typeof o ? ("object" != typeof o || o.constructor == String ? o = k[f] = b$5(null, o) : y$5(o) ? o = k[f] = b$5(M$2, { children: o }) : void 0 === o.constructor && o.__b ? o = k[f] = b$5(o.type, o.props, o.key, o.ref, o.__v) : k[f] = o, l = f + _, o.__ = n, o.__b = n.__b + 1, e = null, ~(c = o.__i = O$1(o, i, l, w)) && (w--, (e = i[c]) && (e.__u |= 2)), e && e.__v ? (o.__u |= 2, c == l - 1 ? _-- : c == l + 1 ? _++ : c != l && (c > l ? _-- : _++, g = !0)) : (~c || (u > d ? _-- : u < d && _++), "function" != typeof o.type && (o.__u |= 4))) : k[f] = null;
	if (g) {
		for (a = [], s = [], f = 0; f < u; f++) if ((o = k[f]) && 2 & o.__u) {
			for (h = 0, p = a.length; h < p;) a[v = h + p >> 1] < o.__i ? h = v + 1 : p = v;
			a[h] = o.__i, s[f] = h + 1;
		}
		for (_ = a.length; f--;) s[f] && (s[f] == _ ? _-- : k[f].__u |= 4);
	}
	if (w) for (f = 0; f < d; f++) !(e = i[f]) || 2 & e.__u || (e.__e == r && (r = x$5(e)), E$3(e, e));
	return r;
}
function I$1(n, t, i, r) {
	var u, f, o;
	if ("function" == typeof n.type) {
		if (n.props.__P) return t;
		if (u = n.__k) for (f = 0; f < u.length; f++) u[f] && (u[f].__ = n, t = I$1(u[f], t, i, !1));
		return t;
	}
	for (t && !t.parentNode && (t = x$5(n)) && !t.parentNode && (t = null), o = t; o && 8 == o.nodeType;) o = o.nextSibling;
	for (n.__e != o && (!r && i.moveBefore && n.__e.parentNode ? i.moveBefore(n.__e, t) : i.insertBefore(n.__e, t || null)), t = n.__e; (t = t && t.nextSibling) && 8 == t.nodeType;);
	return t;
}
function A$1(n, t) {
	return t = t || [], null != n && "boolean" != typeof n && (y$5(n) ? n.some(function(n) {
		A$1(n, t);
	}) : t.push(n)), t;
}
function O$1(n, t, i, r) {
	var u, f, o, e = n.key, l = n.type, c = t[i], a = c && !(2 & c.__u);
	if (null === c && null == e || a && e == c.key && l == c.type) return i;
	if (r > (a ? 1 : 0)) {
		for (u = i - 1, f = i + 1; u >= 0 || f < t.length;) if ((c = t[o = u >= 0 ? u-- : f++]) && !(2 & c.__u) && e == c.key && l == c.type) return o;
	}
	return -1;
}
function P$3(n, t, i) {
	i ??= "", "-" == t[0] ? n.setProperty(t, i) : n[t] = i;
}
function T$2(n, t, i, r, u) {
	var f, o;
	n: if ("style" == t) if ("string" == typeof i) n.style.cssText = i;
	else {
		if ("string" == typeof r && (n.style.cssText = r = ""), r) for (t in r) i && t in i || P$3(n.style, t, "");
		if (i) for (t in i) r && i[t] == r[t] || P$3(n.style, t, i[t]);
	}
	else if ("o" == t[0] && "n" == t[1]) (n.__e || (n.__e = {}))[t] = i, i && r || (o = a$4[t] || (a$4[t] = q$3(t)), (n.__a || (n.__a = {}))[t] = c$4, f = t != (t = t.replace(l$4, "$1")), (t = t.slice(2))[0] < "a" && (t = t.toLowerCase()), i ? n.addEventListener(t, o, f) : n.removeEventListener(t, o, f));
	else {
		if ("http://www.w3.org/2000/svg" == u) t = t.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
		else if ("width" != t && "height" != t && "href" != t && "list" != t && "form" != t && "tabIndex" != t && "download" != t && "rowSpan" != t && "colSpan" != t && "role" != t && "popover" != t && t in n) try {
			n[t] = null == i ? "" : i;
			break n;
		} catch (n) {}
		"function" == typeof i || (null == i || !1 === i && "-" != t[4] ? n.removeAttribute(t) : n.setAttribute(t, "popover" == t && 1 == i ? "" : i));
	}
}
function q$3(t) {
	return function(i) {
		if (this.__e) {
			var r = this.__e[t];
			if (null == i[e$2]) i[e$2] = c$4++;
			else if (i[e$2] < this.__a[t]) return;
			return r(n$2.event ? n$2.event(i) : i);
		}
	};
}
function N$2(t, i, r, u, f, o, e, l, c, a) {
	var s, h, v, d, g, k, b, m, S, C, j, H, I, A, O, P, T, q, N, z, D = i.type;
	if (void 0 !== i.constructor) return null;
	if (128 & r.__u && (c = 32 & r.__u, s = r.__c.__z)) {
		if (i.__u |= c, h = o = [], 8 == s.nodeType) for (v = 1, d = s.nextSibling; d; d = d.nextSibling) {
			if (8 == d.nodeType) {
				if (d.data.startsWith("$s")) v++;
				else if (d.data.startsWith("/$s") && !--v) break;
			}
			o.push(d);
		}
		else o.push(s);
		l = o[0];
	}
	(s = n$2.__b) && s(i);
	n: if ("function" == typeof D) {
		g = e.length;
		try {
			if (C = i.props, j = (s = D.prototype) && s.render, H = (s = D.contextType) && u[s.__c], I = s ? H ? H.props.value : s.__ : u, r.__c ? 2 & (k = i.__c = r.__c).__g && (k.__g |= 1) : (j ? i.__c = k = new D(C, I) : (i.__c = k = new $$3(C, I), k.constructor = D, k.render = F$3), H && H.sub(k), k.state || (k.state = {}), k.__n = u, k.__g |= 8, k.__h = [], k.__k = []), j && (k.__s || (k.__s = k.state), D.getDerivedStateFromProps && (k.__s == k.state && (k.__s = w$5({}, k.__s)), w$5(k.__s, D.getDerivedStateFromProps(C, k.__s)))), b = k.props, m = k.state, k.__v = i, r.__c) {
				if (j && !D.getDerivedStateFromProps && C !== b && k.componentWillReceiveProps && k.componentWillReceiveProps(C, I), i.__v == r.__v && !(8 & k.__g) || !(4 & k.__g) && k.shouldComponentUpdate && !1 === k.shouldComponentUpdate(C, k.__s, I)) {
					i.__v != r.__v && (k.props = C, k.state = k.__s, k.__g &= -9), i.__e = r.__e, i.__k = r.__k, i.__k.some(function(n) {
						n && (n.__ = i);
					}), p$5.push.apply(k.__h, k.__k), k.__k = [], k.__h.length && e.push(k), l = x$5(r);
					break n;
				}
				k.componentWillUpdate && k.componentWillUpdate(C, k.__s, I), j && k.componentDidUpdate && k.__h.push(function() {
					k.componentDidUpdate(b, m, S);
				});
			} else j && !D.getDerivedStateFromProps && k.componentWillMount && k.componentWillMount(), j && k.componentDidMount && k.__h.push(k.componentDidMount);
			if (k.context = I, k.props = C, k.__P = t, k.__g &= -5, A = n$2.__r, O = 0, j) k.state = k.__s, k.__g &= -9, A && A(i), s = k.render(k.props, k.state, k.context), p$5.push.apply(k.__h, k.__k), k.__k = [];
			else do
				k.__g &= -9, A && A(i), s = k.render(k.props, k.state, k.context), k.state = k.__s;
			while (8 & k.__g && ++O < 25);
			k.state = k.__s, k.getChildContext && (u = w$5({}, u, k.getChildContext())), j && r.__c && k.getSnapshotBeforeUpdate && (S = k.getSnapshotBeforeUpdate(b, m)), P = s && s.type === M$2 && null == s.key ? s.props.children : s, C.__P && (s = l, f = (t = C.__P).namespaceURI, c = o = null, r.props && r.props.__P != t && (r.__k.some(function(n) {
				n && E$3(n, n);
			}), r.__k = null), l = r.__k ? x$5(r, 0) : null), l = L$2(t, y$5(P) ? P : [P], i, r, u, f, o, e, l, c, a), C.__P && (i.__e = null, l = s), i.__u &= -161, 128 & r.__u && (k.__z = null), h && h.some(_$4), k.__h.length && e.push(k), 1 & k.__g && (k.__g &= -4);
		} catch (t) {
			if (e.length = g, i.__v = null, c || o) if (t.then) {
				if (T = 0, i.__u |= c ? 160 : 128, o) {
					for (~(N = o.indexOf(l || void 0)) || (N = o.length); (z = o[N - 1]) && 8 == z.nodeType;) N--;
					for (; N < o.length; N++) if (z = o[N]) {
						if (o[N] = null, 8 == z.nodeType) {
							if (z.data.startsWith("$s")) T++ || (q = z);
							else if (T && z.data.startsWith("/$s") && !--T) {
								l = z;
								break;
							}
						} else if (!T) break;
					}
				}
				if (!q) {
					for (; l && 8 == l.nodeType && l.nextSibling;) l = l.nextSibling;
					q = l;
				}
				i.__c.__z || (i.__c.__z = q), i.__e = l;
			} else o && o.some(_$4);
			else i.__e = r.__e;
			i.__k || (i.__k = r.__k || []), t.then || V(i), n$2.__e(t, i, r);
		}
	} else l = i.__e = B$3(r.__e, i, r, u, f, o, e, c, a, t);
	return (s = n$2.diffed) && s(i), 128 & i.__u ? void 0 : l;
}
function V(n) {
	n && (n.__c && (n.__c.__g |= 4), n.__k && n.__k.some(V));
}
function z$3(t, i, r) {
	for (var u = 0; u < r.length;) D$2(r[u++], r[u++], r[u++]);
	n$2.__c && n$2.__c(i, t), t.some(function(i) {
		try {
			t = i.__h, i.__h = [], t.some(function(n) {
				n.call(i);
			});
		} catch (t) {
			n$2.__e(t, i.__v);
		}
	});
}
function B$3(t, i, r, u, f, o, e, l, c, a) {
	var s, p, w, g, k, b, m, M, $, S = r.props || h$5, C = i.props, j = i.type;
	if ("svg" == j ? f = "http://www.w3.org/2000/svg" : "math" == j ? f = "http://www.w3.org/1998/Math/MathML" : f || (f = "http://www.w3.org/1999/xhtml"), o) {
		for (s = 0; s < o.length; s++) if ((k = o[s]) && (j ? k.localName == j : 3 == k.nodeType)) {
			t = k, o[s] = null;
			break;
		}
	}
	if (!t) {
		if (M = a.ownerDocument || document, !j) return M.createTextNode(C);
		t = M.createElementNS(f, j, C.is && C), l && (n$2.__m && n$2.__m(i, o), l = !1), o = null;
	}
	if (j) {
		if (a = "template" == j ? t.content : t, o = "textarea" == j && null != C.defaultValue ? null : o && d$4.call(a.childNodes), !l && o) for (S = {}, s = 0; s < t.attributes.length; s++) S[(k = t.attributes[s]).name] = k.value;
		for (s in S) k = S[s], "dangerouslySetInnerHTML" == s ? w = k : "children" == s || s in C || "value" == s && "defaultValue" in C || "checked" == s && "defaultChecked" in C || T$2(t, s, null, k, f);
		for (s in $ = 1 & r.__u, C) k = C[s], "children" == s ? g = k : "dangerouslySetInnerHTML" == s ? p = k : "value" == s ? b = k : "checked" == s ? m = k : l && "function" != typeof k || !(S[s] !== k || $ && null != k) || T$2(t, s, k, S[s], f);
		p ? (l || w && (p.__html == w.__html || p.__html == t.innerHTML) || (t.innerHTML = p.__html), i.__k = []) : (w && (t.textContent = ""), ("foreignObject" == j || "http://www.w3.org/1998/Math/MathML" == f && v$4.test(j)) && (f = "http://www.w3.org/1999/xhtml"), L$2(a, y$5(g) ? g : [g], i, r, u, f, o, e, o ? o[0] : r.__k && x$5(r, 0), l, c), o && o.some(_$4)), l && "textarea" != j || (s = "value", "progress" == j && null == b ? t.removeAttribute(s) : null == b || b === t[s] && ("progress" != j || b) || T$2(t, s, b, S[s], f), s = "checked", null != m && m != t[s] && T$2(t, s, m, S[s], f));
	} else S === C || l && t.data == C || (t.data = C);
	return t;
}
function D$2(t, i, r, u) {
	try {
		"function" == typeof t ? i ? i.__x = t(i) || 1 : u && (u = u.__c || u.__e) && (i = u.__x) && (u.__x = null, "function" == typeof i ? i() : t(null)) : t.current = i;
	} catch (t) {
		n$2.__e(t, r);
	}
}
function E$3(t, i, r) {
	var u, f;
	if (n$2.unmount && n$2.unmount(t), !(u = t.ref) || u.current && u.current != t.__e || D$2(u, null, i, t), u = t.__c) {
		if (u.componentWillUnmount) try {
			u.componentWillUnmount();
		} catch (t) {
			n$2.__e(t, i);
		}
		u.__P = u.__n = null;
	}
	if (u = t.__k) for (f = 0; f < u.length; f++) u[f] && E$3(u[f], i, "function" != typeof t.type || r && !t.props.__P);
	(u = t.__e) && (r || _$4(u), u.__e && (u.__e = null)), t.__e = t.__c = t.__ = null;
}
function F$3(n, t, i) {
	return this.constructor(n, i);
}
var n$2, t$2, i$4, r$3, u$5, f$5, o$5, e$2, l$4, c$4, a$4, h$5, p$5, v$4, y$5, d$4, w$5;
var init_preact = __esmMin((() => {
	h$5 = {};
	p$5 = [];
	v$4 = /^m(i|n|o|s|text|space)$/;
	y$5 = Array.isArray;
	d$4 = p$5.slice;
	w$5 = Object.assign;
	n$2 = { __e: function(n, t, i, r) {
		for (var u, o, e; t = t.__;) if ((u = t.__c) && !(1 & u.__g)) {
			u.__g |= 4;
			try {
				if ((o = u.constructor) && o.getDerivedStateFromError && (u.setState(o.getDerivedStateFromError(n)), e = 8 & u.__g), u.componentDidCatch && (u.componentDidCatch(n, r || {}), e = 8 & u.__g), e) return void (u.__g |= 2);
			} catch (t) {
				n = t, e = 0;
			}
		}
		throw f$5 = 0, n;
	} }, t$2 = 0, i$4 = function(n) {
		return null != n && void 0 === n.constructor;
	}, $$3.prototype.setState = function(n, t) {
		var i = this.__s;
		i && i != this.state || (i = this.__s = w$5({}, this.state)), "function" == typeof n && (n = n(w$5({}, i), this.props)), n && (w$5(i, n), this.__v && (t && this.__k.push(t), C$2(this)));
	}, $$3.prototype.forceUpdate = function(n) {
		this.__v && (this.__g |= 4, n && this.__h.push(n), C$2(this));
	}, $$3.prototype.render = M$2, r$3 = [], f$5 = 0, o$5 = function(n, t) {
		return n.__v.__b - t.__v.__b;
	}, e$2 = Symbol(), l$4 = /(PointerCapture)$|Capture$/i, c$4 = 0, a$4 = {};
}));
//#endregion
//#region ../../node_modules/.pnpm/preact-render-to-string@6.8.0_preact@11.0.1/node_modules/preact-render-to-string/dist/index.mjs
function h$4(e) {
	void 0 !== e.__g ? e.__g |= 8 : e[a$3] = !0;
}
function d$3(e) {
	void 0 !== e.__g ? e.__g &= -9 : e[a$3] = !1;
}
function v$3(e) {
	return void 0 !== e.__g ? !!(8 & e.__g) : !0 === e[a$3];
}
function y$4(e) {
	if (0 === e.length || !1 === m$4.test(e)) return e;
	for (var t = 0, n = 0, r = "", o = ""; n < e.length; n++) {
		switch (e.charCodeAt(n)) {
			case 34:
				o = "&quot;";
				break;
			case 38:
				o = "&amp;";
				break;
			case 60:
				o = "&lt;";
				break;
			default: continue;
		}
		n !== t && (r += e.slice(t, n)), r += o, t = n + 1;
	}
	return n !== t && (r += e.slice(t, n)), r;
}
function b$4(e) {
	var t = "";
	for (var n in e) {
		var r = e[n];
		if (null != r && "" !== r) {
			var o = "-" == n[0] ? n : _$3[n] || (_$3[n] = n.replace(k$2, "-$&").toLowerCase()), i = ";";
			"number" != typeof r || o.startsWith("--") || g$4.has(o) || (i = "px;"), t = t + o + ":" + r + i;
		}
	}
	return t || void 0;
}
function x$4() {
	this.__d = !0;
}
function w$4(e, t) {
	return {
		__v: e,
		context: t,
		props: e.props,
		setState: x$4,
		forceUpdate: x$4,
		__d: !0,
		__h: new Array(0)
	};
}
function F$2(e) {
	return "string" == typeof e ? U$1 + e + Z$1 : j$2(e) ? (e.unshift(U$1), e.push(Z$1), e) : e && "function" == typeof e.then ? e.then(F$2) : U$1 + e + Z$1;
}
function M$1() {
	return {
		beforeDiff: n$2.__b,
		afterDiff: n$2.diffed,
		renderHook: n$2.__r,
		unmountHook: n$2.unmount,
		rootHook: n$2.__,
		commitHook: n$2.__c,
		catchError: n$2.__e,
		errorBoundaries: n$2.errorBoundaries
	};
}
function W$1(e) {
	var t = n$2[r$2];
	n$2[r$2] = !0;
	try {
		return e();
	} finally {
		n$2[r$2] = t;
	}
}
function B$2(n, r, o) {
	var a = M$1();
	try {
		var c = W$1(function() {
			var c, u = g$5(M$2, null);
			return u[i$3] = [n], a.rootHook && a.rootHook(n, ((c = {})[i$3] = u, c.nodeType = 1, c)), N$1(n, r || L$1, !1, void 0, u, !1, o, a);
		});
		return j$2(c) ? c.join($$2) : c;
	} catch (e) {
		if (e.then) throw new Error("Use \"renderToStringAsync\" for suspenseful rendering.");
		throw e;
	} finally {
		a.commitHook && W$1(function() {
			return a.commitHook(n, T$1);
		}), T$1.length = 0;
	}
}
function z$2(e, t, n) {
	var r, i = e.type, a = !0;
	return e[o$4] ? (a = !1, (r = e[o$4]).state = r[c$3]) : r = new i(e.props, t), e[o$4] = r, r.__v = e, r.props = e.props, r.context = t, h$4(r), r.state ?? (r.state = L$1), r[c$3] ?? (r[c$3] = r.state), i.getDerivedStateFromProps ? r.state = P$2({}, r.state, i.getDerivedStateFromProps(r.props, r.state)) : a && r.componentWillMount ? (r.componentWillMount(), r.state = r[c$3] !== r.state ? r[c$3] : r.state) : !a && r.componentWillUpdate && r.componentWillUpdate(), n.renderHook && n.renderHook(e), r.render(r.props, r.state, t);
}
function N$1(e, n, r, a, m, _, g, k) {
	if (null == e || !0 === e || !1 === e || e === $$2) return $$2;
	var x = typeof e;
	if ("object" != x) return "function" == x ? $$2 : "string" == x ? y$4(e) : e + $$2;
	if (j$2(e)) {
		var H, C = $$2;
		m[i$3] = e;
		for (var D = e.length, A = 0; A < D; A++) {
			var S = e[A];
			if (null != S && "boolean" != typeof S) {
				var E, T = N$1(S, n, r, a, m, _, g, k);
				"string" == typeof T ? C += T : (H || (H = new Array(D)), C && H.push(C), C = $$2, j$2(T) ? (E = H).push.apply(E, T) : H.push(T));
			}
		}
		return H ? (C && H.push(C), H) : C;
	}
	if (void 0 !== e.constructor) return $$2;
	e.__ = m, k.beforeDiff && k.beforeDiff(e);
	var U = e.type, Z = e.props;
	if ("function" == typeof U) {
		var M, B, I, O = n;
		if (U === M$2) {
			if ("tpl" in Z) {
				for (var V = $$2, K = 0; K < Z.tpl.length; K++) if (V += Z.tpl[K], Z.exprs && K < Z.exprs.length) {
					var G = Z.exprs[K];
					if (null == G) continue;
					"object" != typeof G || void 0 !== G.constructor && !j$2(G) ? V += G : V += N$1(G, n, r, a, e, _, g, k);
				}
				return V;
			}
			if ("UNSTABLE_comment" in Z) return "<!--" + y$4(Z.UNSTABLE_comment) + "-->";
			B = Z.children;
		} else {
			if (null != (M = U.contextType)) {
				var J = n[M.__c];
				O = J ? J.props.value : M.__;
			}
			var Q = U.prototype && "function" == typeof U.prototype.render;
			if (Q) B = z$2(e, O, k), I = e[o$4];
			else {
				e[o$4] = I = w$4(e, O);
				for (var X = 0; v$3(I) && X++ < 25;) {
					d$3(I), k.renderHook && k.renderHook(e);
					try {
						B = U.call(I, Z, O);
					} catch (t) {
						throw _ && t && "function" == typeof t.then && (e._suspended = !0), t;
					}
				}
				h$4(I);
			}
			if (null != I.getChildContext && (n = P$2({}, n, I.getChildContext())), Q && k.errorBoundaries && (U.getDerivedStateFromError || I.componentDidCatch)) {
				B = null != B && B.type === M$2 && null == B.key && null == B.props.tpl ? B.props.children : B;
				try {
					return N$1(B, n, r, a, e, _, !1, k);
				} catch (i) {
					return U.getDerivedStateFromError && (I[c$3] = U.getDerivedStateFromError(i)), I.componentDidCatch && I.componentDidCatch(i, L$1), v$3(I) ? (B = z$2(e, n, k), null != (I = e[o$4]).getChildContext && (n = P$2({}, n, I.getChildContext())), N$1(B = null != B && B.type === M$2 && null == B.key && null == B.props.tpl ? B.props.children : B, n, r, a, e, _, g, k)) : $$2;
				} finally {
					k.afterDiff && k.afterDiff(e), k.unmountHook && k.unmountHook(e);
				}
			}
		}
		B = null != B && B.type === M$2 && null == B.key && null == B.props.tpl ? B.props.children : B;
		try {
			var Y = N$1(B, n, r, a, e, _, g, k);
			return k.afterDiff && k.afterDiff(e), k.unmountHook && k.unmountHook(e), e._suspended ? F$2(Y) : Y;
		} catch (t) {
			if (!_ && g && g.onError) {
				var ee = function t(o) {
					return g.onError(o, e, function(e, o) {
						try {
							return W$1(function() {
								return N$1(e, n, r, a, o, _, g, k);
							});
						} catch (e) {
							return t(e);
						}
					});
				}(t);
				return void 0 !== ee ? ee : (k.catchError && k.catchError(t, e), $$2);
			}
			if (!_) throw t;
			if (!t || "function" != typeof t.then) throw t;
			return t.then(function t() {
				try {
					var o = W$1(function() {
						return N$1(B, n, r, a, e, _, g, k);
					});
					return e._suspended ? F$2(o) : o;
				} catch (e) {
					if (!e || "function" != typeof e.then) throw e;
					return e.then(t);
				}
			});
		}
	}
	var te, ne = "<" + U, re = $$2;
	for (var oe in Z) {
		var ie = Z[oe];
		if ("function" != typeof (ie = R(ie) ? ie.value : ie) || "class" === oe || "className" === oe) {
			switch (oe) {
				case "children":
					te = ie;
					continue;
				case "key":
				case "ref":
				case "__self":
				case "__source": continue;
				case "htmlFor":
					if ("for" in Z) continue;
					oe = "for";
					break;
				case "className":
					if ("class" in Z) continue;
					oe = "class";
					break;
				case "defaultChecked":
					oe = "checked";
					break;
				case "defaultSelected":
					oe = "selected";
					break;
				case "defaultValue":
				case "value":
					switch (oe = "value", U) {
						case "textarea":
							te = ie;
							continue;
						case "select":
							a = ie;
							continue;
						case "option": a != ie || "selected" in Z || (ne += " selected");
					}
					break;
				case "dangerouslySetInnerHTML":
					re = ie && ie.__html;
					continue;
				case "style":
					"object" == typeof ie && (ie = b$4(ie));
					break;
				case "acceptCharset":
					oe = "accept-charset";
					break;
				case "httpEquiv":
					oe = "http-equiv";
					break;
				default:
					if (u$4.test(oe)) continue;
					f$4.test(oe) ? oe = oe.replace(f$4, "$1:$2").toLowerCase() : "-" !== oe[4] && !p$4.has(oe) || null == ie ? r ? l$3.test(oe) && (oe = "panose1" === oe ? "panose-1" : oe.replace(/([A-Z])/g, "-$1").toLowerCase()) : s$3.test(oe) && (oe = oe.toLowerCase()) : ie += $$2;
			}
			null != ie && !1 !== ie && (ne = !0 === ie || ie === $$2 ? ne + " " + oe : ne + " " + oe + "=\"" + ("string" == typeof ie ? y$4(ie) : ie + $$2) + "\"");
		}
	}
	if (u$4.test(U)) throw new Error(U + " is not a valid HTML tag name in " + ne + ">");
	if (re || ("string" == typeof te ? re = y$4(te) : null != te && !1 !== te && !0 !== te && (re = N$1(te, n, "svg" === U || "foreignObject" !== U && r, a, e, _, g, k))), k.afterDiff && k.afterDiff(e), k.unmountHook && k.unmountHook(e), !re && q$2.has(U)) return ne + "/>";
	var ae = "</" + U + ">", ce = ne + ">";
	return j$2(re) ? [ce].concat(re, [ae]) : "string" != typeof re ? [
		ce,
		re,
		ae
	] : ce + re + ae;
}
function R(e) {
	return null !== e && "object" == typeof e && "function" == typeof e.peek && "value" in e;
}
var r$2, o$4, i$3, a$3, c$3, u$4, f$4, s$3, l$3, p$4, m$4, _$3, g$4, k$2, L$1, T$1, j$2, P$2, $$2, U$1, Z$1, q$2;
var init_dist$1 = __esmMin((() => {
	init_preact();
	r$2 = "__s";
	o$4 = "__c";
	i$3 = "__k";
	a$3 = "__d";
	c$3 = "__s";
	u$4 = /[\s\n\\/='"\0<>]/;
	f$4 = /^(xlink|xmlns|xml)([A-Z])/;
	s$3 = /^(?:accessK|auto[A-Z]|cell|ch|col|cont|cross|dateT|encT|form[A-Z]|frame|hrefL|inputM|maxL|minL|noV|playsI|popoverT|readO|rowS|src[A-Z]|tabI|useM|item[A-Z])/;
	l$3 = /^ac|^ali|arabic|basel|cap|clipPath$|clipRule$|color|dominant|enable|fill|flood|font|glyph[^R]|horiz|image|letter|lighting|marker[^WUH]|overline|panose|pointe|paint|rendering|shape|stop|strikethrough|stroke|text[^L]|transform|underline|unicode|units|^v[^i]|^w|^xH/;
	p$4 = /* @__PURE__ */ new Set(["draggable", "spellcheck"]);
	m$4 = /["&<]/;
	_$3 = {};
	g$4 = /* @__PURE__ */ new Set([
		"animation-iteration-count",
		"border-image-outset",
		"border-image-slice",
		"border-image-width",
		"box-flex",
		"box-flex-group",
		"box-ordinal-group",
		"column-count",
		"fill-opacity",
		"flex",
		"flex-grow",
		"flex-negative",
		"flex-order",
		"flex-positive",
		"flex-shrink",
		"flood-opacity",
		"font-weight",
		"grid-column",
		"grid-row",
		"line-clamp",
		"line-height",
		"opacity",
		"order",
		"orphans",
		"stop-opacity",
		"stroke-dasharray",
		"stroke-dashoffset",
		"stroke-miterlimit",
		"stroke-opacity",
		"stroke-width",
		"tab-size",
		"widows",
		"z-index",
		"zoom"
	]);
	k$2 = /[A-Z]/g;
	L$1 = {};
	T$1 = [];
	j$2 = Array.isArray;
	P$2 = Object.assign;
	$$2 = "";
	U$1 = "<!--$s-->";
	Z$1 = "<!--/$s-->";
	q$2 = /* @__PURE__ */ new Set([
		"area",
		"base",
		"br",
		"col",
		"command",
		"embed",
		"hr",
		"img",
		"input",
		"keygen",
		"link",
		"meta",
		"param",
		"source",
		"track",
		"wbr"
	]);
}));
//#endregion
//#region ../../node_modules/.pnpm/preact-render-to-string@6.8.0_preact@11.0.1/node_modules/preact-render-to-string/dist/stream/index.mjs
function p$3(e) {
	void 0 !== e.__g ? e.__g |= 8 : e[a$2] = !0;
}
function h$3(e) {
	void 0 !== e.__g ? e.__g &= -9 : e[a$2] = !1;
}
function v$2(e) {
	return void 0 !== e.__g ? !!(8 & e.__g) : !0 === e[a$2];
}
function _$2(e) {
	if (0 === e.length || !1 === m$3.test(e)) return e;
	for (var t = 0, r = 0, n = "", o = ""; r < e.length; r++) {
		switch (e.charCodeAt(r)) {
			case 34:
				o = "&quot;";
				break;
			case 38:
				o = "&amp;";
				break;
			case 60:
				o = "&lt;";
				break;
			default: continue;
		}
		r !== t && (n += e.slice(t, r)), n += o, t = r + 1;
	}
	return r !== t && (n += e.slice(t, r)), n;
}
function b$3(e) {
	var t = "";
	for (var r in e) {
		var n = e[r];
		if (null != n && "" !== n) {
			var o = "-" == r[0] ? r : g$3[r] || (g$3[r] = r.replace(k$1, "-$&").toLowerCase()), i = ";";
			"number" != typeof n || o.startsWith("--") || y$3.has(o) || (i = "px;"), t = t + o + ":" + n + i;
		}
	}
	return t || void 0;
}
function x$3() {
	this.__d = !0;
}
function w$3(e, t) {
	return {
		__v: e,
		context: t,
		props: e.props,
		setState: x$3,
		forceUpdate: x$3,
		__d: !0,
		__h: new Array(0)
	};
}
function L(e) {
	return "string" == typeof e ? N + e + T : H$1(e) ? (e.unshift(N), e.push(T), e) : e && "function" == typeof e.then ? e.then(L) : N + e + T;
}
function P$1(e) {
	var t = n$2[n$1];
	n$2[n$1] = !0;
	try {
		return e();
	} finally {
		n$2[n$1] = t;
	}
}
function $$1(n, o, a) {
	var s = {
		beforeDiff: n$2.__b,
		afterDiff: n$2.diffed,
		renderHook: n$2.__r,
		unmountHook: n$2.unmount,
		rootHook: n$2.__,
		commitHook: n$2.__c,
		catchError: n$2.__e,
		errorBoundaries: n$2.errorBoundaries
	};
	try {
		var c = P$1(function() {
			var r, c = g$5(M$2, null);
			return c[i$2] = [n], s.rootHook && s.rootHook(n, ((r = {})[i$2] = c, r.nodeType = 1, r)), j$1(n, o || S$1, !1, void 0, c, !1, a, s);
		});
		return H$1(c) ? c.join(A) : c;
	} catch (e) {
		if (e.then) throw new Error("Use \"renderToStringAsync\" for suspenseful rendering.");
		throw e;
	} finally {
		s.commitHook && P$1(function() {
			return s.commitHook(n, E$2);
		}), E$2.length = 0;
	}
}
function W(e, t, r) {
	var n, i = e.type, a = !0;
	return e[o$3] ? (a = !1, (n = e[o$3]).state = n[s$2]) : n = new i(e.props, t), e[o$3] = n, n.__v = e, n.props = e.props, n.context = t, p$3(n), n.state ?? (n.state = S$1), n[s$2] ?? (n[s$2] = n.state), i.getDerivedStateFromProps ? n.state = D$1({}, n.state, i.getDerivedStateFromProps(n.props, n.state)) : a && n.componentWillMount ? (n.componentWillMount(), n.state = n[s$2] !== n.state ? n[s$2] : n.state) : !a && n.componentWillUpdate && n.componentWillUpdate(), r.renderHook && r.renderHook(e), n.render(n.props, n.state, t);
}
function j$1(e, r, n, a, m, g, y, k) {
	if (null == e || !0 === e || !1 === e || e === A) return A;
	var x = typeof e;
	if ("object" != x) return "function" == x ? A : "string" == x ? _$2(e) : e + A;
	if (H$1(e)) {
		var C, E = A;
		m[i$2] = e;
		for (var N = e.length, T = 0; T < N; T++) {
			var $ = e[T];
			if (null != $ && "boolean" != typeof $) {
				var U, Z = j$1($, r, n, a, m, g, y, k);
				"string" == typeof Z ? E += Z : (C || (C = new Array(N)), E && C.push(E), E = A, H$1(Z) ? (U = C).push.apply(U, Z) : C.push(Z));
			}
		}
		return C ? (E && C.push(E), C) : E;
	}
	if (void 0 !== e.constructor) return A;
	e.__ = m, k.beforeDiff && k.beforeDiff(e);
	var q = e.type, B = e.props;
	if ("function" == typeof q) {
		var I, O, z, R = r;
		if (q === M$2) {
			if ("tpl" in B) {
				for (var V = A, K = 0; K < B.tpl.length; K++) if (V += B.tpl[K], B.exprs && K < B.exprs.length) {
					var Y = B.exprs[K];
					if (null == Y) continue;
					"object" != typeof Y || void 0 !== Y.constructor && !H$1(Y) ? V += Y : V += j$1(Y, r, n, a, e, g, y, k);
				}
				return V;
			}
			if ("UNSTABLE_comment" in B) return "<!--" + _$2(B.UNSTABLE_comment) + "-->";
			O = B.children;
		} else {
			if (null != (I = q.contextType)) {
				var G = r[I.__c];
				R = G ? G.props.value : I.__;
			}
			var J = q.prototype && "function" == typeof q.prototype.render;
			if (J) O = W(e, R, k), z = e[o$3];
			else {
				e[o$3] = z = w$3(e, R);
				for (var Q = 0; v$2(z) && Q++ < 25;) {
					h$3(z), k.renderHook && k.renderHook(e);
					try {
						O = q.call(z, B, R);
					} catch (t) {
						throw g && t && "function" == typeof t.then && (e._suspended = !0), t;
					}
				}
				p$3(z);
			}
			if (null != z.getChildContext && (r = D$1({}, r, z.getChildContext())), J && k.errorBoundaries && (q.getDerivedStateFromError || z.componentDidCatch)) {
				O = null != O && O.type === M$2 && null == O.key && null == O.props.tpl ? O.props.children : O;
				try {
					return j$1(O, r, n, a, e, g, !1, k);
				} catch (i) {
					return q.getDerivedStateFromError && (z[s$2] = q.getDerivedStateFromError(i)), z.componentDidCatch && z.componentDidCatch(i, S$1), v$2(z) ? (O = W(e, r, k), null != (z = e[o$3]).getChildContext && (r = D$1({}, r, z.getChildContext())), j$1(O = null != O && O.type === M$2 && null == O.key && null == O.props.tpl ? O.props.children : O, r, n, a, e, g, y, k)) : A;
				} finally {
					k.afterDiff && k.afterDiff(e), k.unmountHook && k.unmountHook(e);
				}
			}
		}
		O = null != O && O.type === M$2 && null == O.key && null == O.props.tpl ? O.props.children : O;
		try {
			var X = j$1(O, r, n, a, e, g, y, k);
			return k.afterDiff && k.afterDiff(e), k.unmountHook && k.unmountHook(e), e._suspended ? L(X) : X;
		} catch (t) {
			if (!g && y && y.onError) {
				var ee = function t(o) {
					return y.onError(o, e, function(e, o) {
						try {
							return P$1(function() {
								return j$1(e, r, n, a, o, g, y, k);
							});
						} catch (e) {
							return t(e);
						}
					});
				}(t);
				return void 0 !== ee ? ee : (k.catchError && k.catchError(t, e), A);
			}
			if (!g) throw t;
			if (!t || "function" != typeof t.then) throw t;
			return t.then(function t() {
				try {
					var o = P$1(function() {
						return j$1(O, r, n, a, e, g, y, k);
					});
					return e._suspended ? L(o) : o;
				} catch (e) {
					if (!e || "function" != typeof e.then) throw e;
					return e.then(t);
				}
			});
		}
	}
	var te, re = "<" + q, ne = A;
	for (var oe in B) {
		var ie = B[oe];
		if ("function" != typeof (ie = M(ie) ? ie.value : ie) || "class" === oe || "className" === oe) {
			switch (oe) {
				case "children":
					te = ie;
					continue;
				case "key":
				case "ref":
				case "__self":
				case "__source": continue;
				case "htmlFor":
					if ("for" in B) continue;
					oe = "for";
					break;
				case "className":
					if ("class" in B) continue;
					oe = "class";
					break;
				case "defaultChecked":
					oe = "checked";
					break;
				case "defaultSelected":
					oe = "selected";
					break;
				case "defaultValue":
				case "value":
					switch (oe = "value", q) {
						case "textarea":
							te = ie;
							continue;
						case "select":
							a = ie;
							continue;
						case "option": a != ie || "selected" in B || (re += " selected");
					}
					break;
				case "dangerouslySetInnerHTML":
					ne = ie && ie.__html;
					continue;
				case "style":
					"object" == typeof ie && (ie = b$3(ie));
					break;
				case "acceptCharset":
					oe = "accept-charset";
					break;
				case "httpEquiv":
					oe = "http-equiv";
					break;
				default:
					if (c$2.test(oe)) continue;
					u$3.test(oe) ? oe = oe.replace(u$3, "$1:$2").toLowerCase() : "-" !== oe[4] && !d$2.has(oe) || null == ie ? n ? f$3.test(oe) && (oe = "panose1" === oe ? "panose-1" : oe.replace(/([A-Z])/g, "-$1").toLowerCase()) : l$2.test(oe) && (oe = oe.toLowerCase()) : ie += A;
			}
			null != ie && !1 !== ie && (re = !0 === ie || ie === A ? re + " " + oe : re + " " + oe + "=\"" + ("string" == typeof ie ? _$2(ie) : ie + A) + "\"");
		}
	}
	if (c$2.test(q)) throw new Error(q + " is not a valid HTML tag name in " + re + ">");
	if (ne || ("string" == typeof te ? ne = _$2(te) : null != te && !1 !== te && !0 !== te && (ne = j$1(te, r, "svg" === q || "foreignObject" !== q && n, a, e, g, y, k))), k.afterDiff && k.afterDiff(e), k.unmountHook && k.unmountHook(e), !ne && F$1.has(q)) return re + "/>";
	var ae = "</" + q + ">", se = re + ">";
	return H$1(ne) ? [se].concat(ne, [ae]) : "string" != typeof ne ? [
		se,
		ne,
		ae
	] : se + ne + ae;
}
function M(e) {
	return null !== e && "object" == typeof e && "function" == typeof e.peek && "value" in e;
}
function U(e) {
	return "<script" + (e ? " nonce=\"" + _$2(e) + "\"" : "") + ">(function(){class e extends HTMLElement{connectedCallback(){var e=this;if(!e.isConnected)return;let t=this.getAttribute(\"data-target\");if(t){for(var r,o,n=document.createNodeIterator(document,128);n.nextNode();){let e=n.referenceNode;if(e.data==\"$s:\"+t?r=e:e.data==\"/$s:\"+t&&(o=e),r&&o)break}r&&o&&r.parentNode!==document?requestAnimationFrame(()=>{if(e.isConnected&&r.isConnected&&o.isConnected&&r.parentNode===o.parentNode){for(var t=[],a=r.nextSibling,i=r.parentNode;a&&a!==o;)t.push(a),a=a.nextSibling;if(a){for(;i&&!i.__k;)i=i.parentNode;var d=new Set;if(i&&function e(t){t&&(\"function\"!=typeof t.type&&t.__e&&t.__e.parentNode===r.parentNode&&d.add(t.__e),t.__k&&t.__k.forEach(e))}(i.__k),t.some(e=>d.has(e))){var s=0;return t.forEach(e=>{8===e.nodeType&&e.data.startsWith(\"$s\")?s++:8===e.nodeType&&e.data.startsWith(\"/$s\")?s--:s||d.has(e)||e.remove()}),void e.remove()}for(a=o.previousSibling;a!=r&&a&&a!=r;)o.parentNode.removeChild(a),a=o.previousSibling;for(n=r;e.firstChild;)r=e.firstChild,e.removeChild(r),n.after(r),n=r;e.parentNode.removeChild(e)}else e.remove()}else e.remove()}):e.remove()}}}customElements.define(\"preact-island\",e);}())<\/script>";
}
function Z(e, t) {
	return "<preact-island hidden data-target=\"" + e + "\">" + t + "</preact-island>";
}
function I(e, t, r) {
	var n = this;
	if (e && e.then) {
		for (; t = t.__;) {
			var i = t[o$3];
			if (i && i.__c) break;
		}
		if (t) {
			var a = t.__v, s = this.suspended.find(function(e) {
				return e.id === a;
			}), c = new C$1(), u = this.abortSignal;
			u && (u.aborted ? c.resolve() : u.addEventListener("abort", c.resolve));
			var l = e.then(function() {
				if (!u || !u.aborted) {
					var e = n.suspended.length, o = r(t.props.children, t);
					n.suspended.slice(e).some(function(e) {
						return e.id === a;
					}) || n.onWrite(Z(a, o));
				}
			}, this.onError);
			this.suspended.push({
				id: a,
				vnode: t,
				promise: Promise.race([l, c.promise])
			});
			var f = r(t.props.fallback);
			return s ? "" : "<!--$s:" + a + "-->" + f + "<!--/$s:" + a + "-->";
		}
	}
}
function O(e, t, r) {
	var n = new C$1(), o = new TextEncoder("utf-8"), i = new ReadableStream({ start: function(i) {
		B$1(e, {
			context: r,
			nonce: null == t ? void 0 : t.nonce,
			onError: function(e) {
				n.reject(e), i.abort(e);
			},
			onWrite: function(e) {
				i.enqueue(o.encode(e));
			}
		}).then(function() {
			i.close(), n.resolve();
		}).catch(function(e) {
			i.error(e), n.reject(e);
		});
	} });
	return i.allReady = n.promise, i;
}
var n$1, o$3, i$2, a$2, s$2, c$2, u$3, l$2, f$3, d$2, m$3, g$3, y$3, k$1, C$1, S$1, E$2, H$1, D$1, A, N, T, F$1, q$1, B$1;
var init_stream = __esmMin((() => {
	init_preact();
	n$1 = "__s";
	o$3 = "__c";
	i$2 = "__k";
	a$2 = "__d";
	s$2 = "__s";
	c$2 = /[\s\n\\/='"\0<>]/;
	u$3 = /^(xlink|xmlns|xml)([A-Z])/;
	l$2 = /^(?:accessK|auto[A-Z]|cell|ch|col|cont|cross|dateT|encT|form[A-Z]|frame|hrefL|inputM|maxL|minL|noV|playsI|popoverT|readO|rowS|src[A-Z]|tabI|useM|item[A-Z])/;
	f$3 = /^ac|^ali|arabic|basel|cap|clipPath$|clipRule$|color|dominant|enable|fill|flood|font|glyph[^R]|horiz|image|letter|lighting|marker[^WUH]|overline|panose|pointe|paint|rendering|shape|stop|strikethrough|stroke|text[^L]|transform|underline|unicode|units|^v[^i]|^w|^xH/;
	d$2 = /* @__PURE__ */ new Set(["draggable", "spellcheck"]);
	m$3 = /["&<]/;
	g$3 = {};
	y$3 = /* @__PURE__ */ new Set([
		"animation-iteration-count",
		"border-image-outset",
		"border-image-slice",
		"border-image-width",
		"box-flex",
		"box-flex-group",
		"box-ordinal-group",
		"column-count",
		"fill-opacity",
		"flex",
		"flex-grow",
		"flex-negative",
		"flex-order",
		"flex-positive",
		"flex-shrink",
		"flood-opacity",
		"font-weight",
		"grid-column",
		"grid-row",
		"line-clamp",
		"line-height",
		"opacity",
		"order",
		"orphans",
		"stop-opacity",
		"stroke-dasharray",
		"stroke-dashoffset",
		"stroke-miterlimit",
		"stroke-opacity",
		"stroke-width",
		"tab-size",
		"widows",
		"z-index",
		"zoom"
	]);
	k$1 = /[A-Z]/g;
	C$1 = function() {
		var e = this;
		this.promise = new Promise(function(t, r) {
			e.resolve = t, e.reject = r;
		});
	};
	S$1 = {};
	E$2 = [];
	H$1 = Array.isArray;
	D$1 = Object.assign;
	A = "";
	N = "<!--$s-->";
	T = "<!--/$s-->";
	F$1 = /* @__PURE__ */ new Set([
		"area",
		"base",
		"br",
		"col",
		"command",
		"embed",
		"hr",
		"img",
		"input",
		"keygen",
		"link",
		"meta",
		"param",
		"source",
		"track",
		"wbr"
	]);
	q$1 = function e(t) {
		try {
			var r = function() {
				if (t.suspended.length > 0) {
					var r = [].concat(t.suspended);
					return Promise.resolve(Promise.all(t.suspended.map(function(e) {
						return e.promise;
					}))).then(function() {
						return t.suspended = t.suspended.filter(function(e) {
							return !r.includes(e);
						}), Promise.resolve(e(t)).then(function() {});
					});
				}
			}();
			return Promise.resolve(r && r.then ? r.then(function() {}) : void 0);
		} catch (e) {
			return Promise.reject(e);
		}
	};
	B$1 = function(e, t) {
		var r = t.context, n = t.onWrite, o = t.abortSignal, i = t.nonce;
		try {
			r = r || {};
			var a = {
				start: Date.now(),
				abortSignal: o,
				onWrite: n,
				onError: I,
				suspended: []
			}, s = $$1(e, r, a), c = a.suspended.length, u = function() {
				if (c > 0) {
					var e = s.lastIndexOf("</body>"), t = s.trimStart().startsWith("<html"), r = -1 !== e ? s.slice(0, e) : s;
					return n((t ? "<!DOCTYPE html>" : "") + r), n("<div hidden>"), n(U(i)), Promise.resolve(q$1(a)).then(function() {
						n("</div>"), -1 !== e && n(s.slice(e));
					});
				}
				n(s);
			}();
			return Promise.resolve(u && u.then ? u.then(function() {}) : void 0);
		} catch (e) {
			return Promise.reject(e);
		}
	};
}));
//#endregion
//#region ../core/dist/jsonify/constants.js
var init_constants = __esmMin((() => {}));
//#endregion
//#region ../core/dist/jsonify/stringify.js
/**
* Serializes data into a compact, reference-sharing format that can be parsed
* by {@link parse}. Values are collected into a flat slot array; composites
* only store indexes into that array, which makes circular references and
* shared references cheap and exact.
*
* Supported: `undefined`, `null`, `boolean`, `number` (incl. `NaN`, `±Infinity`
* and `-0`), `bigint`, `string`, `Array`, plain `Object`, `Uint8Array`, `URL`,
* `Date`, `RegExp`, `Set`, `Map` plus any custom tag handled by `custom`.
* Functions cannot be serialized and throw.
*/
function stringify(data, custom) {
	const out = [];
	const res = serializeInner(out, /* @__PURE__ */ new Map(), data, custom);
	if (res < 0) return String(res);
	return `[${out.join(",")}]`;
}
function serializeInner(out, indexes, value, custom) {
	const seenIdx = indexes.get(value);
	if (seenIdx !== void 0) return seenIdx;
	if (value === void 0) return -1;
	if (value === null) return -2;
	if (Number.isNaN(value)) return -3;
	if (value === Infinity) return -4;
	if (value === -Infinity) return -5;
	if (value === 0 && 1 / value < 0) return -6;
	const idx = out.length;
	out.push("");
	indexes.set(value, idx);
	let str = "";
	if (typeof value === "number") str += String(value);
	else if (typeof value === "boolean") str += String(value);
	else if (typeof value === "bigint") str += `["BigInt","${value}"]`;
	else if (typeof value === "string") str += JSON.stringify(value);
	else if (Array.isArray(value)) {
		str += "[";
		for (let i = 0; i < value.length; i++) {
			str += i in value ? serializeInner(out, indexes, value[i], custom) : String(-7);
			if (i < value.length - 1) str += ",";
		}
		str += "]";
	} else if (typeof value === "object" || typeof value === "function") {
		if (custom !== void 0) for (const k in custom) {
			const fn = custom[k];
			if (fn === void 0) continue;
			const res = fn(value);
			if (res === void 0) continue;
			str = `["${k}",${serializeInner(out, indexes, res.value, custom)}]`;
			out[idx] = str;
			return idx;
		}
		if (typeof value === "function") throw new Error("Hum: serializing functions is not supported. Island props and page level event handlers must be serializable data (or a signal / a factory from `@humjs/core/events`).");
		if (value instanceof URL) str += `["URL","${value.href}"]`;
		else if (value instanceof Date) {
			let iso;
			try {
				iso = value.toISOString();
			} catch {
				iso = "Invalid Date";
			}
			str += `["Date","${iso}"]`;
		} else if (value instanceof RegExp) str += `["RegExp",${JSON.stringify(value.source)}, "${value.flags}"]`;
		else if (value instanceof Uint8Array) str += `["Uint8Array","${b64encode(value)}"]`;
		else if (value instanceof Set) {
			const items = new Array(value.size);
			let i = 0;
			value.forEach((v) => {
				items[i++] = String(serializeInner(out, indexes, v, custom));
			});
			str += `["Set",[${items.join(",")}]]`;
		} else if (value instanceof Map) {
			const items = new Array(value.size * 2);
			let i = 0;
			value.forEach((v, k) => {
				items[i++] = String(serializeInner(out, indexes, k, custom));
				items[i++] = String(serializeInner(out, indexes, v, custom));
			});
			str += `["Map",[${items.join(",")}]]`;
		} else {
			str += "{";
			const keys = Object.keys(value);
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				str += JSON.stringify(key) + ":";
				str += serializeInner(out, indexes, value[key], custom);
				if (i < keys.length - 1) str += ",";
			}
			str += "}";
		}
	}
	out[idx] = str;
	return idx;
}
/** Encodes bytes as RFC4648 base64. */
function b64encode(uint8) {
	let result = "";
	let i;
	const l = uint8.length;
	for (i = 2; i < l; i += 3) {
		result += base64abc[uint8[i - 2] >> 2];
		result += base64abc[(uint8[i - 2] & 3) << 4 | uint8[i - 1] >> 4];
		result += base64abc[(uint8[i - 1] & 15) << 2 | uint8[i] >> 6];
		result += base64abc[uint8[i] & 63];
	}
	if (i === l + 1) {
		result += base64abc[uint8[i - 2] >> 2];
		result += base64abc[(uint8[i - 2] & 3) << 4];
		result += "==";
	}
	if (i === l) {
		result += base64abc[uint8[i - 2] >> 2];
		result += base64abc[(uint8[i - 2] & 3) << 4 | uint8[i - 1] >> 4];
		result += base64abc[(uint8[i - 1] & 15) << 2];
		result += "=";
	}
	return result;
}
var base64abc;
var init_stringify = __esmMin((() => {
	init_constants();
	base64abc = [
		"A",
		"B",
		"C",
		"D",
		"E",
		"F",
		"G",
		"H",
		"I",
		"J",
		"K",
		"L",
		"M",
		"N",
		"O",
		"P",
		"Q",
		"R",
		"S",
		"T",
		"U",
		"V",
		"W",
		"X",
		"Y",
		"Z",
		"a",
		"b",
		"c",
		"d",
		"e",
		"f",
		"g",
		"h",
		"i",
		"j",
		"k",
		"l",
		"m",
		"n",
		"o",
		"p",
		"q",
		"r",
		"s",
		"t",
		"u",
		"v",
		"w",
		"x",
		"y",
		"z",
		"0",
		"1",
		"2",
		"3",
		"4",
		"5",
		"6",
		"7",
		"8",
		"9",
		"+",
		"/"
	];
}));
//#endregion
//#region ../core/dist/routing/island_tag.js
/** The island a component declares itself to be, or `undefined`. */
function islandTagOf(component) {
	const kind = typeof component;
	if (kind !== "function" && (kind !== "object" || component === null)) return;
	return component[ISLAND_TAG];
}
var ISLAND_TAG_KEY, ISLAND_TAG;
var init_island_tag = __esmMin((() => {
	ISLAND_TAG_KEY = "hum.island";
	ISLAND_TAG = Symbol.for(ISLAND_TAG_KEY);
}));
//#endregion
//#region ../core/dist/runtime/events.js
/** Returns the factory marker of a value, if it was produced by a factory. */
function factoryMarkerOf(value) {
	if (value === null || typeof value !== "object" && typeof value !== "function") return;
	return value[FACTORY_MARKER];
}
/**
* Wraps a handler factory so its result carries a serializable marker, and
* registers it under `name` for the client runtime.
*
* `name` travels in the payload instead of the function, so it has to be unique
* in the app and stable across versions. The module a factory is defined in
* must also be evaluated in the browser—import it from the client entry, or
* from an island the page loads—otherwise the client has no implementation to
* rebuild the handler with. Arguments follow the same rules as any other page
* level prop: plain data, signals, or other factory results.
*/
function defineFactory(name, fn) {
	if (hum_factories[name] !== void 0) console.warn(`Hum: the handler factory "${name}" was defined twice; the last definition wins. Factory names travel in the payload, so they have to stay unique.`);
	const wrapper = (...args) => {
		const value = fn(...args);
		if (value !== null && (typeof value === "object" || typeof value === "function")) Object.defineProperty(value, FACTORY_MARKER, {
			value: {
				factory: name,
				args
			},
			configurable: true,
			writable: true,
			enumerable: false
		});
		return value;
	};
	hum_factories[name] = wrapper;
	return wrapper;
}
/**
* Coerces a value read off a DOM property to the type the signal currently
* holds, so `<input type="number">` (whose `value` is a string) round-trips
* through a `Signal<number>`. Unparseable input is passed through unchanged,
* which lets a partially typed value survive.
*/
function coerceToSignalType(value, previous) {
	if (value === null || value === void 0) return null;
	if (typeof previous === "number" || typeof previous === "bigint") {
		if (typeof value === "number") return value;
		if (typeof value === "string" && value.trim() === "") return 0;
		const num = Number(value);
		return Number.isNaN(num) ? value : num;
	}
	return value;
}
var FACTORY_MARKER, hum_factories, add, setFromProp;
var init_events = __esmMin((() => {
	FACTORY_MARKER = "__humFactory";
	hum_factories = Object.create(null);
	add = defineFactory("add", (signal, delta, options) => {
		const max = options?.max ?? Infinity;
		const min = options?.min ?? -Infinity;
		return () => {
			signal.value = Math.min(Math.max(signal.value + delta, min), max);
		};
	});
	defineFactory("setValue", (signal, value) => () => {
		signal.value = value;
	});
	defineFactory("toggle", (signal) => () => {
		signal.value = !signal.value;
	});
	setFromProp = defineFactory("setFromProp", (signal, key) => (event) => {
		const target = event.currentTarget;
		signal.value = coerceToSignalType(target === null ? void 0 : target[key], signal.peek());
	});
}));
//#endregion
//#region ../core/dist/runtime/shared.js
function tagPartial(fn) {
	Object.assign(fn, { [PARTIAL_FLAG]: true });
	return fn;
}
/** Returns true for any vnode whose type is Hum's `Partial` component. */
function isPartialType(type) {
	return typeof type === "function" && type[PARTIAL_FLAG] === true;
}
var IS_BROWSER, PARTIAL_FLAG, Partial;
var init_shared$1 = __esmMin((() => {
	init_shared_internal();
	IS_BROWSER = typeof document !== "undefined";
	PARTIAL_FLAG = "__humPartial";
	Partial = tagPartial(function Partial(props) {
		return props.children;
	});
	Object.assign(Partial, { displayName: "Partial" });
}));
//#endregion
//#region ../core/dist/runtime/server/preact_hooks.js
function getRenderState() {
	return renderStateStorage.getStore() ?? null;
}
function withRenderState(state, fn) {
	return renderStateStorage.run(state, fn);
}
/**
* Wraps an options hook, chaining to the previously installed one so other
* addons (and `preact-render-to-string` itself) keep working. When the
* installed hook returns a value it wins; otherwise the previous hook's value
* is used, which is what value returning hooks like `attr` need.
*/
function wrapHook(key, hook) {
	const options = n$2;
	const prev = options[key];
	options[key] = (...args) => {
		const result = hook(...args);
		if (result !== void 0) return result;
		return prev?.(...args);
	};
}
function wrapWithMarker(vnode, kind, marker) {
	return g$5(M$2, null, g$5(M$2, { UNSTABLE_comment: marker }), vnode, g$5(M$2, { UNSTABLE_comment: `/hum:${kind}` }));
}
/** Marker component: replaced by the collected `<head>` elements. */
function HeadPlaceholder(props) {
	return g$5(M$2, { UNSTABLE_comment: HEAD_PLACEHOLDER_PREFIX + props.id });
}
/** Marker component: replaced by the client bootstrap script. */
function ScriptsPlaceholder(props) {
	return g$5(M$2, { UNSTABLE_comment: SCRIPTS_PLACEHOLDER_PREFIX + props.id });
}
/**
* Renders a JSX element that was passed as a prop to an island, wrapped in
* `hum:slot` markers so the client can pick the DOM range up again.
*/
function Slot(props) {
	const state = getRenderState();
	if (state !== null) state.slots[props.id] = null;
	return wrapWithMarker(props.children, "slot", slotMarker(props.id, props.name));
}
/**
* The island a component is, if the build publishes one under that name.
*
* Identity is the component's own — the tag the bundler left on it — so a
* component is recognized wherever it was loaded from.
*/
function islandOf(state, component) {
	const tag = islandTagOf(component);
	return tag === void 0 ? void 0 : state.buildCache.islands.get(tag.name);
}
/** Checks whether the current component is (nested) inside an island. */
function hasIslandOwner(state, vnode) {
	let current = vnode;
	let owner;
	while (current !== void 0 && (owner = state.owners.get(current)) !== void 0) {
		if (islandOf(state, owner.type) !== void 0) return true;
		current = owner;
	}
	return false;
}
function isSignal(x) {
	return x !== null && typeof x === "object" && typeof x.peek === "function" && "value" in x;
}
function isComputedSignal(x) {
	return isSignal(x) && ("x" in x && typeof x.x === "function" || "_fn" in x && typeof x._fn === "function");
}
function isVNode(x) {
	return x !== null && typeof x === "object" && "type" in x && "ref" in x && "__k" in x && i$4(x);
}
function rememberSignalProps(vnode, props) {
	let signals;
	for (const name in props) {
		const value = props[name];
		if (isSignal(value)) (signals ??= {})[name] = value;
	}
	if (signals !== void 0) VNODE_SIGNAL_PROPS.set(vnode, signals);
}
/**
* True when the component that is currently rendering is (nested) inside an
* island. Walks the owner chain from the vnode on top of the render stack, so
* it can run while a vnode is being created.
*/
function isInsideIsland(state) {
	let current = state.ownerStack.at(-1);
	while (current !== void 0) {
		if (islandOf(state, current.type) !== void 0) return true;
		current = state.owners.get(current);
	}
	return false;
}
/**
* Whether page level facets are part of the payload of this render. Inside a
* partial response only the regions are updated, so everything outside them is
* dropped: those nodes are already hydrated on the client.
*/
function recordsFacets(state) {
	return !state.partialRequest || state.partialDepth > 0;
}
/**
* True for props whose name looks like a DOM event handler: `onClick`, but also
* `oninput`, the shape `preact/compat` normalizes `onInput`—and the `onChange`
* of a text input—into before Hum sees the vnode.
*
* Preact attaches every `on*` prop holding a function as a listener and only
* lowercases the name when it starts with a capital, so accepting either case
* here is what the client will do with the prop anyway.
*/
function isEventProp(name) {
	if (name.length < 3 || name[0] !== "o" || name[1] !== "n") return false;
	const c = name.charCodeAt(2);
	return c >= 65 && c <= 90 || c >= 97 && c <= 122;
}
/**
* Component that renders the current value of a page level signal and brackets
* it with `hum:signal` markers, so the client can hand the text node over to a
* `SignalText` component leaf.
*/
function SignalFacet(props) {
	const state = getRenderState();
	if (state === null || props.insideIsland || !recordsFacets(state)) return props.signal.peek();
	const idx = recordFacet(state, { signal: props.signal });
	return wrapWithMarker(props.signal.peek(), "signal", signalMarker(idx));
}
function recordFacet(state, entry) {
	state.facetCount++;
	return state.payload.push(entry) - 1;
}
/**
* Replaces page level signal children with a `SignalFacet`. Signals inside an
* island are left alone: the island's own client render binds them, so markers
* there would be thrown away with the island's server rendered markup.
*/
function wrapFacetChildren(props, state) {
	const children = props.children;
	if (children === void 0 || children === null) return;
	if (isSignal(children)) {
		if (isComputedSignal(children)) return;
		props.children = g$5(SignalFacet, {
			signal: children,
			insideIsland: isInsideIsland(state)
		});
		return;
	}
	if (!Array.isArray(children)) return;
	let replaced;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!isSignal(child) || isComputedSignal(child)) continue;
		replaced ??= children.slice();
		replaced[i] = g$5(SignalFacet, {
			signal: child,
			insideIsland: isInsideIsland(state)
		});
	}
	if (replaced !== void 0) props.children = replaced;
}
/**
* Moves page level signal props and serializable handlers out of the vnode into
* the payload, leaving the `data-hum-signal` / `data-hum-handler` attributes
* behind for the client to
* rebind them from.
*
* Signal props are peeked everywhere, including inside islands: a signal is not
* a DOM attribute, and the island binds it again when it renders on the client.
*/
function bindFacetProps(vnode, props, state, pageLevel) {
	const record = pageLevel && recordsFacets(state);
	/** Signals this vnode carried when it was created. */
	const remembered = VNODE_SIGNAL_PROPS.get(vnode);
	let signals;
	let handlers;
	for (const name in props) {
		if (name === "children" || name === "key" || name === "ref" || name === "data-hum-signal" || name === "data-hum-handler") continue;
		const value = props[name];
		const signalProp = isSignal(value) ? value : remembered?.[name];
		if (signalProp !== void 0) {
			const peekable = signalProp;
			if (isComputedSignal(signalProp)) continue;
			props[name] = peekable.peek();
			if (record) (signals ??= {})[name] = recordFacet(state, { signal: signalProp });
			continue;
		}
		if (typeof value !== "function") continue;
		if (factoryMarkerOf(value) !== void 0) {
			if (record) (handlers ??= {})[name] = recordFacet(state, { handler: value });
			delete props[name];
		} else if (pageLevel && isEventProp(name)) {
			const normalized = name === name.toLowerCase() ? " The name is lowercased because an addon such as `preact/compat` normalizes event names." : "";
			throw new Error(`Hum: the page level handler for \`${name}\` cannot be serialized. Build it with a factory from \`@humjs/core/events\` (setFromProp, setValue, add, toggle), or move it into an island.` + normalized);
		}
	}
	if (signals !== void 0) props[FACET_SIGNAL_ATTR] = JSON.stringify(signals);
	if (handlers !== void 0) props[FACET_HANDLER_ATTR] = JSON.stringify(handlers);
}
/**
* Installs the Preact options hooks that implement islands, slots and
* partials. Head tags come from route `head` exports and are therefore never
* intercepted here.
*
* The flag that keeps this idempotent lives on Preact's options object, which
* is one object per Preact: re-evaluating the module in place (a bundler's HMR)
* marks the same one and installs nothing twice. A flag on `globalThis` would
* instead be shared by every copy of the framework in the same process — or in
* the same Worker isolate — so the first copy to install would silence all the
* others. Those copies render with no hooks at all: no island markers, no
* slots, and a page whose `<html>` the renderer never sees, which it answers by
* wrapping the finished document in a second one.
*/
function installHooks() {
	const options = n$2;
	if (options[HOOKS_FLAG] === true) return;
	options[HOOKS_FLAG] = true;
	wrapHook(OptionsType.VNODE, (...args) => {
		const vnode = args[0];
		const state = getRenderState();
		if (state !== null) {
			state.owners.set(vnode, state.ownerStack.at(-1));
			if (vnode.type === "a") setActiveUrl(vnode, state.pathname, state.search);
			if (vnode.type === "script" || vnode.type === "style") {
				const props = vnode.props;
				if (props.nonce === void 0) props.nonce = state.nonce;
			}
			if (vnode.type === "head") appendChild(vnode, g$5(HeadPlaceholder, { id: state.nonce }));
			if (vnode.type === "body") appendChild(vnode, g$5(ScriptsPlaceholder, { id: state.nonce }));
			const props = vnode.props;
			if ("data-hum-client-nav" in props) props[CLIENT_NAV_ATTR] = String(props[CLIENT_NAV_ATTR]);
			if (typeof vnode.type === "string") {
				rememberSignalProps(vnode, props);
				wrapFacetChildren(props, state);
			}
		}
		if (isPartialType(vnode.type)) {
			const props = vnode.props;
			const mode = !props.mode || props.mode === "replace" ? PartialMode.Replace : props.mode === "append" ? PartialMode.Append : PartialMode.Prepend;
			props.children = wrapWithMarker(props.children, "partial", partialMarker(props.name, mode, normalizeKey(vnode.key)));
		}
	});
	wrapHook(OptionsType.ATTR, (...args) => {
		const [name, value] = args;
		if (name === "data-hum-client-nav") return `${CLIENT_NAV_ATTR}="${String(Boolean(value))}"`;
		if (name === "key") return `${DATA_HUM_KEY}="${escapeAttr(String(value))}"`;
	});
	wrapHook(OptionsType.DIFF, (...args) => {
		const vnode = args[0];
		const state = getRenderState();
		if (state === null) return;
		if (typeof vnode.type === "function" && vnode.type !== M$2) {
			if (isPartialType(vnode.type)) {
				state.partialDepth++;
				const props = vnode.props;
				if (typeof props.name === "string") {
					if (state.encounteredPartials.has(props.name)) throw new Error(`Hum: the rendered response contains the partial "${props.name}" more than once. Partial names must be unique per page.`);
					state.encounteredPartials.add(props.name);
				}
				return;
			}
			if (PATCHED.has(vnode)) return;
			const island = islandOf(state, vnode.type);
			if (island === void 0) return;
			if (hasIslandOwner(state, vnode)) {
				for (const css of island.css) state.islandAssets.add(css);
				return;
			}
			state.islands.add(island);
			if (state.partialDepth > 0 || state.facetOwnerStack.at(-1) === true) state.eagerIslands.add(island);
			const originalType = vnode.type;
			vnode.type = ((props) => {
				for (const name in props) {
					const value = props[name];
					if (name === "children" || i$4(value) && !isSignal(value)) {
						const slotId = state.slots.length;
						state.slots.push({
							id: slotId,
							name,
							vnode: value
						});
						props[name] = g$5(Slot, {
							name,
							id: slotId
						}, value);
					}
				}
				const propsIdx = state.payload.push({ props }) - 1;
				const child = g$5(originalType, props);
				PATCHED.add(child);
				return wrapWithMarker(child, "island", islandMarker(island.name, propsIdx, normalizeKey(vnode.key)));
			});
			return;
		}
		if (typeof vnode.type === "string") {
			switch (vnode.type) {
				case "html":
					state.renderedHtmlTag = true;
					break;
				case "head":
					state.renderedHtmlHead = true;
					break;
				case "body": state.renderedHtmlBody = true;
			}
			const props = vnode.props;
			if ("data-hum-client-nav" in props && props["data-hum-client-nav"] === "true") state.clientNavEnabled = true;
			const insideIsland = hasIslandOwner(state, vnode);
			if (vnode.key !== void 0 && (state.partialDepth > 0 || insideIsland)) props[DATA_HUM_KEY] = String(vnode.key);
			bindFacetProps(vnode, props, state, !insideIsland);
			state.facetOwnerStack.push(state.facetOwnerStack.at(-1) === true || "data-hum-signal" in props || "data-hum-handler" in props);
		}
	});
	wrapHook(OptionsType.RENDER, (...args) => {
		const vnode = args[0];
		const state = getRenderState();
		if (state !== null && typeof vnode.type === "function" && vnode.type !== M$2) state.ownerStack.push(vnode);
	});
	wrapHook(OptionsType.DIFFED, (...args) => {
		const vnode = args[0];
		const state = getRenderState();
		if (state !== null && typeof vnode.type === "function" && vnode.type !== M$2) {
			state.ownerStack.pop();
			if (isPartialType(vnode.type)) state.partialDepth--;
		}
		if (state !== null && typeof vnode.type === "string") state.facetOwnerStack.pop();
	});
}
function escapeAttr(value) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function appendChild(vnode, child) {
	const props = vnode.props;
	if (props.children === void 0 || props.children === null) props.children = child;
	else if (Array.isArray(props.children)) props.children.push(child);
	else props.children = [props.children, child];
}
/**
* Serializes the island props, page level signals and page level handlers
* collected during the render into the compact payload the client runtime
* revives. The result is plain JSON text; callers embed it as a JS string
* literal so the client can parse it again.
*/
function serializePayload(state) {
	return stringify(state.payload, HUM_STRINGIFIERS);
}
var HEAD_PLACEHOLDER_PREFIX, SCRIPTS_PLACEHOLDER_PREFIX, RenderState, RENDER_STATE_KEY, globalRef, renderStateStorage, VNODE_SIGNAL_PROPS, HUM_STRINGIFIERS, PATCHED, HOOKS_FLAG;
var init_preact_hooks = __esmMin((() => {
	init_preact();
	init_stringify();
	init_island_tag();
	init_events();
	init_shared$1();
	init_shared_internal();
	HEAD_PLACEHOLDER_PREFIX = "hum:head-placeholder:";
	SCRIPTS_PLACEHOLDER_PREFIX = "hum:scripts-placeholder:";
	RenderState = class {
		nonce;
		partialDepth = 0;
		slots = [];
		payload = [];
		/** Number of page level facets that were recorded in `payload`. */
		facetCount = 0;
		islands = /* @__PURE__ */ new Set();
		/** Islands whose renderer must already be available to an enclosing tree. */
		eagerIslands = /* @__PURE__ */ new Set();
		islandAssets = /* @__PURE__ */ new Set();
		/** Head tags merged from the `head` exports of the render chain. */
		headNodes = [];
		owners = /* @__PURE__ */ new Map();
		ownerStack = [];
		facetOwnerStack = [];
		encounteredPartials = /* @__PURE__ */ new Set();
		renderedHtmlTag = false;
		renderedHtmlHead = false;
		renderedHtmlBody = false;
		clientNavEnabled = false;
		/**
		* When the response only needs to update partials, the collected head
		* elements and the bootstrap script are replaced by a state JSON script.
		*/
		partialRequest;
		url;
		pathname;
		search;
		buildCache;
		basePath;
		constructor(options) {
			this.url = options.url;
			this.pathname = options.url.pathname;
			this.search = options.url.search;
			this.buildCache = options.buildCache;
			this.basePath = options.basePath;
			this.partialRequest = options.url.searchParams.has(PARTIAL_SEARCH_PARAM);
			this.nonce = globalThis.crypto.randomUUID().replaceAll("-", "");
		}
		clear() {
			this.islands.clear();
			this.islandAssets.clear();
			this.eagerIslands.clear();
			this.encounteredPartials.clear();
			this.owners.clear();
			this.headNodes = [];
			this.slots = [];
			this.payload = [];
			this.facetCount = 0;
			this.ownerStack = [];
			this.facetOwnerStack = [];
		}
		/** True when the page needs the client runtime at all. */
		get needsClientRuntime() {
			if (this.islands.size > 0 || this.clientNavEnabled || this.facetCount > 0) return true;
			if (!this.partialRequest && this.encounteredPartials.size > 0) return true;
			return false;
		}
	};
	RENDER_STATE_KEY = "__humRenderStateStorage__";
	globalRef = globalThis;
	renderStateStorage = globalRef[RENDER_STATE_KEY] ?? (globalRef[RENDER_STATE_KEY] = new AsyncLocalStorage());
	VNODE_SIGNAL_PROPS = /* @__PURE__ */ new WeakMap();
	HUM_STRINGIFIERS = {
		Computed: (value) => isComputedSignal(value) ? { value: value.peek() } : void 0,
		Signal: (value) => isSignal(value) ? { value: value.peek() } : void 0,
		Fn: (value) => {
			const marker = factoryMarkerOf(value);
			return marker === void 0 ? void 0 : { value: [marker.factory, marker.args] };
		},
		Slot: (value) => {
			if (isVNode(value) && value.type === Slot) {
				const props = value.props;
				return { value: {
					name: props.name,
					id: props.id
				} };
			}
		}
	};
	PATCHED = /* @__PURE__ */ new WeakSet();
	HOOKS_FLAG = "__hum_preact_hooks_installed__";
	installHooks();
}));
//#endregion
//#region ../core/dist/runtime/server/document.js
/** Minimal document shell used when the project has no `_app.tsx`. */
function DefaultApp(props) {
	return g$5("html", { lang: "en" }, g$5("head", null, g$5("meta", { charset: "utf-8" }), g$5("meta", {
		name: "viewport",
		content: "width=device-width, initial-scale=1"
	})), g$5("body", null, props.children));
}
function withBase(basePath, url) {
	if (basePath === "" || basePath === "/") return url;
	if (!url.startsWith("/")) return url;
	return basePath.replace(/\/$/, "") + url;
}
function link(rel, href) {
	return g$5("link", {
		rel,
		href
	});
}
/**
* Renders everything that belongs into `<head>`: the head tags merged from the
* `head` exports of the render chain plus the preload/style tags of the islands
* that were used. Runs after the main render so it can contain the island
* assets that were discovered while walking the tree.
*/
function renderHead(state) {
	const nodes = renderResourceNodes(state);
	for (const node of state.headNodes) nodes.push(node);
	if (nodes.length === 0) return "";
	return B$2(g$5(M$2, null, nodes));
}
function renderResourceNodes(state) {
	const nodes = [];
	if (state.buildCache.dev && !state.partialRequest) nodes.push(g$5("script", {
		type: "module",
		src: VITE_CLIENT_URL
	}));
	if (state.needsClientRuntime) {
		nodes.push(link("modulepreload", withBase(state.basePath, state.buildCache.clientEntry)));
		for (const island of eagerIslandModules(state)) nodes.push(link("modulepreload", withBase(state.basePath, island.clientUrl)));
	}
	const styles = /* @__PURE__ */ new Set([...state.buildCache.entryAssets, ...collectIslandCss(state)]);
	for (const css of styles) nodes.push(link("stylesheet", withBase(state.basePath, css)));
	return nodes;
}
function resourceKeys(state) {
	const keys = /* @__PURE__ */ new Set();
	for (const node of renderResourceNodes(state)) {
		const props = node.props;
		if (props.rel !== void 0 && props.href !== void 0) keys.add(`${props.rel}:${props.href}`);
	}
	return keys;
}
function renderLateResources(state, alreadyRendered) {
	const nodes = renderResourceNodes(state).filter((node) => {
		const props = node.props;
		return props.rel !== void 0 && props.href !== void 0 && !alreadyRendered.has(`${props.rel}:${props.href}`);
	});
	if (nodes.length === 0) return "";
	return B$2(g$5(M$2, null, nodes));
}
function collectIslandCss(state) {
	const out = [];
	for (const island of state.islands) out.push(...island.css);
	for (const css of state.islandAssets) out.push(css);
	return out;
}
function eagerIslandModules(state) {
	return [...state.eagerIslands];
}
/**
* URLs that should be preloaded alongside the document. Surfaced as
* `Link: <...>; rel=modulepreload` response headers.
*/
function preloadLinks(state) {
	if (!state.needsClientRuntime) return [];
	const out = [withBase(state.basePath, state.buildCache.clientEntry)];
	for (const island of eagerIslandModules(state)) out.push(withBase(state.basePath, island.clientUrl));
	return out;
}
/** Builds the static import statement for one island. */
function islandImport(island, index, basePath) {
	const url = withBase(basePath, island.clientUrl);
	const local = `hum_island_${index}`;
	return {
		statement: island.exportName === "default" ? `import ${local} from "${url}";` : `import { ${island.exportName} as ${local} } from "${url}";`,
		local
	};
}
/**
* Renders the client bootstrap (or, for partial requests, the state JSON the
* client uses to revive newly appearing islands).
*/
function renderScripts(state) {
	const islands = [...state.islands];
	if (state.partialRequest) {
		const json = {
			islands: islands.map((island) => ({
				name: island.name,
				url: withBase(state.basePath, island.clientUrl),
				exportName: island.exportName
			})),
			props: serializePayload(state)
		};
		return B$2(g$5("script", {
			id: PARTIAL_STATE_ID,
			type: "application/json",
			dangerouslySetInnerHTML: { __html: escapeScript(JSON.stringify(json)) }
		}));
	}
	if (!state.needsClientRuntime) return "";
	const imports = [];
	const entries = [];
	const loaders = [];
	const eager = new Set(eagerIslandModules(state));
	for (let i = 0; i < islands.length; i++) {
		const island = islands[i];
		if (eager.has(island)) {
			const { statement, local } = islandImport(island, i, state.basePath);
			imports.push(statement);
			entries.push(`${JSON.stringify(island.name)}:${local}`);
			continue;
		}
		const url = withBase(state.basePath, island.clientUrl);
		loaders.push(`${JSON.stringify(island.name)}:()=>import(${JSON.stringify(url)}).then((module)=>module[${JSON.stringify(island.exportName)}])`);
	}
	const clientEntry = withBase(state.basePath, state.buildCache.clientEntry);
	const props = escapeScript(JSON.stringify(serializePayload(state)));
	const content = `import { boot } from "${clientEntry}";${imports.join("")}boot({${entries.join(",")}},${props},{${loaders.join(",")}});`;
	return B$2(g$5("script", {
		type: "module",
		nonce: state.nonce,
		dangerouslySetInnerHTML: { __html: content }
	}));
}
/**
* Replaces `token` with `replacement` without letting `String.replace`
* interpret `$&` style sequences in user generated HTML: the replacement is
* passed through a function so it is inserted verbatim.
*/
function replaceOnce(html, token, replacement) {
	return html.replace(token, () => replacement);
}
function wrapInDefaultDocument(bodyHtml, headHtml, scriptsHtml) {
	return `<html><head>${headHtml}</head><body>${bodyHtml}${scriptsHtml}</body></html>`;
}
/** Comment placeholder a custom `_app` can leave for Hum to fill in. */
function headPlaceholder(nonce) {
	return `<!--${HEAD_PLACEHOLDER_PREFIX}${nonce}-->`;
}
function scriptsPlaceholder(nonce) {
	return `<!--${SCRIPTS_PLACEHOLDER_PREFIX}${nonce}-->`;
}
function injectDocumentFragments(html, state, options) {
	const { headHtml, scriptsHtml, nonce } = options;
	let result = html;
	let headInjected = false;
	if (options.injectHead !== false) {
		const token = headPlaceholder(nonce);
		if (result.includes(token)) {
			result = replaceOnce(result, token, headHtml);
			headInjected = true;
		} else if (state.renderedHtmlHead && result.includes("</head>")) {
			result = replaceOnce(result, "</head>", headHtml + "</head>");
			headInjected = true;
		}
	}
	if (options.injectScripts !== false) {
		const token = scriptsPlaceholder(nonce);
		if (result.includes(token)) result = replaceOnce(result, token, scriptsHtml);
		else if (state.renderedHtmlBody) result = replaceOnce(result, "</body>", scriptsHtml + "</body>");
	}
	return {
		html: result,
		headInjected
	};
}
/**
* Assembles the final document by substituting the head and bootstrap
* fragments into their placeholders. Both can only be computed once the whole
* tree has rendered, which is why they are not part of the initial render.
*/
function assembleDocument(state, pageHtml) {
	const headHtml = renderHead(state);
	const scriptsHtml = renderScripts(state);
	if (!state.renderedHtmlTag || !state.renderedHtmlHead || !state.renderedHtmlBody) return "<!DOCTYPE html>" + wrapInDefaultDocument(pageHtml, headHtml, scriptsHtml);
	const { html } = injectDocumentFragments(pageHtml, state, {
		headHtml,
		scriptsHtml,
		nonce: state.nonce
	});
	return "<!DOCTYPE html>" + html;
}
/**
* Renders a vnode with the Hum hooks active and returns the document HTML. The
* head tags of the request must already be merged into the render state.
*/
function renderDocument(vnode) {
	const state = getRenderState();
	if (state === null) throw new Error("Hum: renderDocument() called without an active render state. Render a route through `renderRoute()`, or call `page()` inside a handler, instead of calling the renderer directly.");
	return assembleDocument(state, B$2(vnode));
}
function safeStreamChunkLength(html, maxLength) {
	const tags = /<\/?preact-island\b[^>]*>/g;
	let depth = 0;
	let openStart = 0;
	for (const match of html.matchAll(tags)) {
		const index = match.index;
		if (index >= maxLength) break;
		if (match[0].startsWith("</")) {
			if (match.index + match[0].length > maxLength) return openStart;
			depth--;
			if (depth === 0) openStart = 0;
		} else {
			if (depth === 0) openStart = index;
			depth++;
		}
	}
	return depth === 0 ? maxLength : openStart;
}
/**
* Streams a document using Preact's experimental Suspense renderer. Head data
* and resources found in the initial shell are emitted first; assets discovered
* in resumed subtrees and the island bootstrap are emitted before `</body>`.
*/
function renderDocumentStream(vnode) {
	const state = getRenderState();
	if (state === null) throw new Error("Hum: renderDocumentStream() called without an active render state.");
	const reader = O(vnode, { nonce: state.nonce }).getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	const fullDocument = state.renderedHtmlTag && state.renderedHtmlHead && state.renderedHtmlBody;
	const headHtml = renderHead(state);
	const alreadyRendered = resourceKeys(state);
	const headToken = headPlaceholder(state.nonce);
	const scriptsToken = scriptsPlaceholder(state.nonce);
	const holdLength = Math.max(headToken.length, scriptsToken.length, 20);
	let buffer = "";
	let started = false;
	let finished = false;
	let headInjected = !fullDocument;
	const startDocument = () => {
		if (fullDocument) return buffer.startsWith("<!DOCTYPE html>") ? "" : "<!DOCTYPE html>";
		return `<!DOCTYPE html><html><head>${headHtml}</head><body>`;
	};
	const prepare = (text) => {
		let result = text;
		if (!headInjected) {
			const injected = injectDocumentFragments(result, state, {
				headHtml,
				scriptsHtml: "",
				nonce: state.nonce,
				injectScripts: false
			});
			headInjected = injected.headInjected;
			result = injected.html;
		}
		return result.replaceAll(scriptsToken, "");
	};
	return new ReadableStream({
		async pull(controller) {
			try {
				let safeLength = 0;
				while (!finished && safeLength === 0) {
					if (buffer.length > holdLength) {
						safeLength = safeStreamChunkLength(buffer, buffer.length - holdLength);
						if (safeLength > 0) break;
					}
					const { value, done } = await reader.read();
					if (done) {
						buffer += decoder.decode();
						finished = true;
						break;
					}
					buffer += decoder.decode(value, { stream: true });
					if (!started && buffer.length > 0) {
						const prefix = startDocument();
						started = true;
						if (prefix !== "") controller.enqueue(encoder.encode(prefix));
					}
				}
				if (!started && finished) {
					const prefix = startDocument();
					started = true;
					if (prefix !== "") controller.enqueue(encoder.encode(prefix));
				}
				if (!finished && safeLength > 0) {
					const safe = prepare(buffer.slice(0, safeLength));
					buffer = buffer.slice(safeLength);
					if (safe !== "") controller.enqueue(encoder.encode(safe));
					return;
				}
				if (finished) {
					const final = withRenderState(state, () => {
						const resources = renderLateResources(state, alreadyRendered);
						const scripts = renderScripts(state);
						let tail = prepare(buffer);
						if (fullDocument) {
							const bodyClose = tail.lastIndexOf("</body>");
							if (bodyClose !== -1) tail = tail.slice(0, bodyClose) + resources + scripts + tail.slice(bodyClose);
							else tail += resources + scripts;
						} else tail += resources + scripts + "</body></html>";
						return tail;
					});
					if (final !== "") controller.enqueue(encoder.encode(final));
					controller.close();
					state.clear();
					reader.releaseLock();
				}
			} catch (error) {
				state.clear();
				reader.releaseLock();
				controller.error(error);
			}
		},
		async cancel(reason) {
			if (finished) return;
			finished = true;
			state.clear();
			await reader.cancel(reason);
		}
	});
}
var VITE_CLIENT_URL;
var init_document = __esmMin((() => {
	init_preact();
	init_dist$1();
	init_stream();
	init_shared_internal();
	init_preact_hooks();
	n$2.errorBoundaries = true;
	VITE_CLIENT_URL = "/@vite/client";
}));
//#endregion
//#region ../core/dist/runtime/server/head.js
function isSingletonLinkRel(rel) {
	return rel === "canonical" || rel === "manifest";
}
/**
* Identity of one head tag. Tags describing the same thing share an identity so
* that a more specific `head` export can replace a broader one, while the
* position (set by the outermost export) is preserved.
*/
function headCacheKey(vnode) {
	const type = String(vnode.type);
	if (vnode.key !== void 0 && vnode.key !== null) return String(vnode.key);
	if (type === "title") return "title";
	const props = vnode.props;
	const keys = Object.keys(props).sort();
	let key = type;
	for (const name of keys) {
		if (name === "children" || name === "nonce" || name === "ref") continue;
		if (name === "dangerouslySetInnerHTML") {
			key += String(props[name]?.__html ?? "");
			continue;
		}
		if (type === "meta" && name === "content") continue;
		if (type === "link" && name === "href" && isSingletonLinkRel(props.rel)) continue;
		key += `::${String(props[name])}`;
	}
	return key;
}
/** Flattens a `head` value into individual tags, unwrapping fragments/arrays. */
function flatten(node, out) {
	if (node === null || node === void 0 || typeof node === "boolean") return;
	if (Array.isArray(node)) {
		for (const child of node) flatten(child, out);
		return;
	}
	if (i$4(node)) {
		if (node.type === M$2) {
			flatten(node.props.children, out);
			return;
		}
		out.push(typeof node.type === "string" ? {
			key: headCacheKey(node),
			node
		} : {
			key: null,
			node
		});
		return;
	}
	out.push({
		key: null,
		node
	});
}
/** Resolves a `head` export to JSX, supporting both its forms. */
function resolveHead(head, props) {
	return typeof head === "function" ? head(props) : head;
}
/**
* Merges the `head` exports of a render chain, outermost first
* (`_app` → `_layout`s → page).
*
* Merging is data level, not render level: nothing about it depends on the
* order in which components render. That is why the server can render the head
* tags in one small pass and inject them into the document `<head>` afterwards,
* instead of intercepting every head tag in the component tree.
*/
function mergeHeads(chain, props) {
	const byKey = /* @__PURE__ */ new Map();
	const unkeyed = [];
	for (const mod of chain) {
		const head = mod?.head;
		if (head === void 0 || head === null) continue;
		const entries = [];
		flatten(resolveHead(head, props), entries);
		for (const entry of entries) {
			if (entry.key === null) {
				unkeyed.push(entry);
				continue;
			}
			byKey.set(entry.key, entry);
		}
	}
	return [...unkeyed, ...byKey.values()].map((entry) => entry.node);
}
var init_head = __esmMin((() => {
	init_preact();
}));
//#endregion
//#region ../core/dist/render.js
function routeProps(input, extra) {
	return {
		params: input.params,
		url: input.url,
		state: input.state,
		route: input.route.file,
		...extra
	};
}
/**
* Runs a page component through the layout / app chain and renders the final
* document. Head tags are collected from the `head` exports of the app shell,
* the layouts and the page, merged, and rendered into the document `<head>`.
*/
async function renderTree(input, page, pageModule, props, status) {
	const { config, loader, route, buildCache } = input;
	const skipInheritedLayouts = pageModule?.config?.skipInheritedLayouts === true;
	const skipAppWrapper = pageModule?.config?.skipAppWrapper ?? false;
	let appModule;
	if (!skipAppWrapper && route.app !== void 0) appModule = await loader.load(route.app);
	const layoutModules = [];
	if (!skipInheritedLayouts) for (const spec of route.layouts) {
		const mod = await loader.load(spec);
		if (mod.default !== void 0) layoutModules.push(mod);
	}
	const headChain = [];
	if (appModule !== void 0) headChain.push(appModule);
	headChain.push(...layoutModules);
	if (pageModule !== null) headChain.push(pageModule);
	let children = g$5(M$2, null, page);
	for (let i = layoutModules.length - 1; i >= 0; i--) children = g$5(layoutModules[i].default, props, children);
	const root = appModule?.default === void 0 ? g$5(DefaultApp, null, children) : g$5(appModule.default, props, children);
	const renderState = new RenderState({
		url: input.url,
		buildCache,
		basePath: config.basePath
	});
	renderState.headNodes = mergeHeads(headChain, props);
	return await withRenderState(renderState, () => {
		if (pageModule?.config?.streaming === true) return {
			body: renderDocumentStream(root),
			links: preloadLinks(renderState),
			status
		};
		try {
			return {
				body: renderDocument(root),
				links: preloadLinks(renderState),
				status
			};
		} finally {
			renderState.clear();
		}
	});
}
/**
* Renders a matched route with optional handler data and response options.
*/
async function renderRoute(input, data, options = {}) {
	const mod = await input.loader.load(input.route.file);
	if (mod.default === void 0) throw new Error(`Hum: route "${input.route.file}" has no default export. Add a component, or export a "handlers" object to answer the request.`);
	const props = {
		...routeProps(input),
		data
	};
	return await renderTree(input, g$5(mod.default, props), mod, props, options.status ?? 200);
}
function errorStatus(error) {
	if (error instanceof HttpError) return error.status;
	if (error !== null && typeof error === "object" && "status" in error && typeof error.status === "number") return error.status;
	return 500;
}
function DefaultErrorContent(props) {
	const error = props.error;
	const message = error instanceof Error ? error.message : String(error ?? "");
	const dev = props.dev === true;
	return g$5("div", { style: "font-family: system-ui; padding: 2rem; max-width: 48rem" }, g$5("h1", { style: "font-size:1.5rem" }, "Internal Server Error"), dev ? g$5("pre", { style: "white-space:pre-wrap" }, message) : null, dev && error instanceof Error && error.stack ? g$5("pre", { style: "white-space:pre-wrap; font-size:0.75rem; opacity:0.7" }, error.stack) : null);
}
/** Renders the nearest `_error` page for a failed request. */
async function renderError(input, error) {
	const status = errorStatus(error);
	const props = routeProps(input, {
		error,
		status,
		dev: input.config.dev
	});
	let page;
	let pageModule = null;
	if (input.route.error !== void 0) try {
		const mod = await input.loader.load(input.route.error);
		pageModule = mod;
		page = mod.default === void 0 ? g$5(DefaultErrorContent, props) : g$5(mod.default, props);
	} catch (loadErr) {
		input.config.logger.error("hum: failed to load the _error page:", loadErr);
		page = g$5(DefaultErrorContent, props);
	}
	else page = g$5(DefaultErrorContent, props);
	return await renderTree(input, page, pageModule, props, status);
}
function DefaultNotFoundContent() {
	return g$5("div", { style: "font-family: system-ui; padding: 2rem" }, g$5("h1", { style: "font-size:1.5rem" }, "404 - Not Found"));
}
/** Finds the deepest `_404` page that applies to `pathname`. */
function findNotFound(notFound, pathname) {
	for (const entry of notFound) if (entry.matchers.some((m) => m.test(pathname))) return entry;
}
/** Renders the 404 page for an unmatched request. */
async function renderNotFound(input, pathname) {
	const found = findNotFound(input.notFound, pathname);
	const props = routeProps(input, { status: 404 });
	let page = g$5(DefaultNotFoundContent, props);
	let pageModule = null;
	if (found !== void 0) try {
		const mod = await input.loader.load(found.file);
		pageModule = mod;
		if (mod.default !== void 0) page = g$5(mod.default, props);
	} catch (err) {
		input.config.logger.error("hum: failed to load the _404 page:", err);
	}
	return await renderTree(input, page, pageModule, props, 404);
}
var init_render = __esmMin((() => {
	init_preact();
	init_error();
	init_document();
	init_head();
	init_preact_hooks();
}));
//#endregion
//#region ../core/dist/routing/path_to_pattern.js
function parseSegment(raw) {
	const params = [];
	if (GROUP_SEGMENT.test(raw)) return {
		raw,
		kind: "static",
		params,
		piece: "",
		omittable: true
	};
	const honoWildcard = HONO_WILDCARD.exec(raw);
	if (honoWildcard !== null) {
		params.push(honoWildcard[1]);
		return {
			raw,
			kind: "wildcard",
			params,
			piece: raw,
			omittable: false
		};
	}
	const honoParam = HONO_PARAM.exec(raw);
	if (honoParam !== null) {
		params.push(honoParam[1]);
		return {
			raw,
			kind: "param",
			params,
			piece: raw,
			omittable: false
		};
	}
	let piece = "";
	let cursor = 0;
	let wildcard = false;
	let optionalCount = 0;
	let paramCount = 0;
	let sawLiteral = false;
	TOKEN.lastIndex = 0;
	let match;
	while ((match = TOKEN.exec(raw)) !== null) {
		const literal = raw.slice(cursor, match.index);
		if (literal.length > 0) {
			piece += literal.replace(/[{}?*:]/g, (c) => `\\${c}`);
			sawLiteral = true;
		}
		cursor = match.index + match[0].length;
		if (match[1] !== void 0) {
			params.push(match[1]);
			piece += `:${match[1]}`;
			optionalCount++;
			paramCount++;
		} else if (match[2] !== void 0) {
			params.push(match[2]);
			piece += `:${match[2]}{.*}`;
			wildcard = true;
		} else {
			params.push(match[3]);
			piece += `:${match[3]}`;
			paramCount++;
		}
	}
	const tail = raw.slice(cursor);
	if (tail.length > 0) {
		piece += tail.replace(/[{}?*:]/g, (c) => `\\${c}`);
		sawLiteral = true;
	}
	if (!(cursor > 0)) return {
		raw,
		kind: "static",
		params,
		piece: raw,
		omittable: false
	};
	if (wildcard && !sawLiteral && raw.startsWith("[...")) return {
		raw,
		kind: "wildcard",
		params,
		piece,
		omittable: false
	};
	if (optionalCount === 1 && paramCount === 1 && !sawLiteral && raw.startsWith("[[")) return {
		raw,
		kind: "optional",
		params,
		piece,
		omittable: true
	};
	return {
		raw,
		kind: sawLiteral ? "mixed" : "param",
		params,
		piece,
		omittable: false
	};
}
/** Parses a Hum url path into a Hono compatible pattern description. */
function parseUrlPath(urlPath) {
	const rawSegments = urlPath.split("/").filter((s) => s.length > 0);
	const segments = [];
	for (const raw of rawSegments) {
		if (GROUP_SEGMENT.test(raw)) continue;
		segments.push(parseSegment(raw));
	}
	const params = [];
	let dynamicCount = 0;
	let hasWildcard = false;
	let score = 0;
	for (const seg of segments) {
		for (const p of seg.params) params.push(p);
		if (seg.params.length > 0) dynamicCount++;
		if (seg.kind === "wildcard") {
			hasWildcard = true;
			score += 1;
		} else if (seg.kind === "static") score += 10;
		else if (seg.kind === "optional") score += 4;
		else score += 3;
	}
	const optionalIndexes = segments.map((seg, i) => seg.omittable && seg.raw.startsWith("[[") ? i : -1).filter((i) => i >= 0);
	const honoPatterns = optionalIndexes.length > 0 && optionalIndexes.length <= MAX_OPTIONAL_EXPANSION ? expandOptional(segments, optionalIndexes) : [joinPattern(segments, /* @__PURE__ */ new Set())];
	const pattern = joinPattern(segments, /* @__PURE__ */ new Set());
	const specificity = score * 100 + segments.length;
	const total = hasWildcard ? specificity - 1e5 : specificity;
	return {
		pattern: pattern.length === 0 ? "/" : pattern,
		honoPatterns,
		params,
		segments,
		dynamicCount,
		hasWildcard,
		score: total
	};
}
function joinPattern(segments, omit) {
	const parts = [];
	for (let i = 0; i < segments.length; i++) {
		if (omit.has(i)) continue;
		parts.push(segments[i].piece);
	}
	if (parts.length === 0) return "/";
	return "/" + parts.join("/");
}
function expandOptional(segments, optionalIndexes) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	const total = 1 << optionalIndexes.length;
	for (let mask = 0; mask < total; mask++) {
		const omit = /* @__PURE__ */ new Set();
		for (let i = 0; i < optionalIndexes.length; i++) if (mask & 1 << i) omit.add(optionalIndexes[i]);
		const pattern = joinPattern(segments, omit);
		if (!seen.has(pattern)) {
			seen.add(pattern);
			out.push(pattern);
		}
	}
	out.sort((a, b) => b.length - a.length);
	return out;
}
/** The directory segments of a routes-relative path, groups removed. */
function dirSegments(relDir) {
	return relDir.split("/").filter((s) => s.length > 0 && !GROUP_SEGMENT.test(s));
}
/** Hum url path of a route file: `blog/[id].tsx` -> `/blog/[id]`. */
function urlPathOf(relFileNoExt, isRouteFile) {
	const raw = relFileNoExt.split("/").filter((s) => s.length > 0);
	let base = raw.pop() ?? "";
	const dir = dirSegments(raw.join("/"));
	if (isRouteFile) {
		if (base === "index") base = "";
		const all = base.length > 0 ? [...dir, base] : dir;
		return all.length === 0 ? "/" : "/" + all.join("/");
	}
	return dir.length === 0 ? "/" : "/" + dir.join("/");
}
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* Builds the source of a matcher for `info`. With `subpaths` the result also
* matches every path below `info`.
*/
function matcherSource(info, subpaths) {
	const parts = [];
	for (const seg of info.segments) {
		if (seg.kind === "static") {
			parts.push("/" + escapeRegExp(seg.piece));
			continue;
		}
		if (seg.kind === "wildcard") {
			const name = seg.params[0];
			parts.push(`(?:/(?<${name}>.*))?`);
			continue;
		}
		if (seg.kind === "optional") {
			const name = seg.params[0];
			parts.push(`(?:/(?<${name}>[^/]+))?`);
			continue;
		}
		if (seg.params.length === 1) {
			const name = seg.params[0];
			parts.push(`/(?<${name}>[^/]+)`);
			continue;
		}
		let piece = "/";
		let cursor = 0;
		const raw = seg.raw;
		TOKEN.lastIndex = 0;
		let match;
		while ((match = TOKEN.exec(raw)) !== null) {
			piece += escapeRegExp(raw.slice(cursor, match.index));
			cursor = match.index + match[0].length;
			if (match[1] !== void 0) piece += `(?<${match[1]}>[^/]*)?`;
			else if (match[2] !== void 0) piece += `(?<${match[2]}>.*)`;
			else piece += `(?<${match[3]}>[^/]+)`;
		}
		piece += escapeRegExp(raw.slice(cursor));
		parts.push(piece);
	}
	if (parts.length === 0) return subpaths ? "^/" : "^/?$";
	return `^${parts.join("")}${subpaths ? "(?:/.*)?" : "/?"}$`;
}
/**
* Like {@link compileMatcher}, but also matches every path below `info`. A
* `_404` page applies to the whole directory below it, not just to the exact
* directory URL.
*/
function compilePrefixMatcher(info) {
	return new RegExp(matcherSource(info, true));
}
var GROUP_SEGMENT, TOKEN, HONO_WILDCARD, HONO_PARAM, MAX_OPTIONAL_EXPANSION;
var init_path_to_pattern = __esmMin((() => {
	GROUP_SEGMENT = /^\(.*\)$/;
	TOKEN = /\[\[([A-Za-z0-9_]+)\]\]|\[\.\.\.([A-Za-z0-9_]+)\]|\[([A-Za-z0-9_]+)\]/g;
	HONO_WILDCARD = /^:([A-Za-z0-9_]+)\{\.\*\}$/;
	HONO_PARAM = /^:([A-Za-z0-9_]+)$/;
	MAX_OPTIONAL_EXPANSION = 4;
}));
//#endregion
//#region ../core/dist/routing/fs_routes.js
/** The directory of a routes-relative file, with `/` separators. */
function dirOf(relFile, routesDir) {
	const rel = relFile.startsWith(routesDir + "/") ? relFile.slice(routesDir.length + 1) : relFile;
	const idx = rel.lastIndexOf("/");
	return idx === -1 ? "" : rel.slice(0, idx);
}
function isAncestorDir(ancestor, dir) {
	if (ancestor === dir) return true;
	if (ancestor === "") return true;
	return dir.startsWith(ancestor + "/");
}
function depthOf(dir) {
	return dir === "" ? 0 : dir.split("/").length;
}
/** All directories from the root down to `dir`, inclusive. */
function dirsUpTo(dir) {
	const out = [""];
	if (dir === "") return out;
	const parts = dir.split("/");
	for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join("/"));
	return out;
}
/** Sorts route files the way they should be registered on Hono. */
function sortRouteFiles(files) {
	return [...files].sort((a, b) => {
		const sa = parseUrlPath(a.urlPath).score;
		const sb = parseUrlPath(b.urlPath).score;
		if (sa !== sb) return sb - sa;
		return a.urlPath < b.urlPath ? -1 : a.urlPath > b.urlPath ? 1 : 0;
	});
}
function byDir(files, routesDir) {
	const map = /* @__PURE__ */ new Map();
	for (const file of files) {
		const dir = dirOf(file.file, routesDir);
		const list = map.get(dir);
		if (list === void 0) map.set(dir, [file]);
		else list.push(file);
	}
	return map;
}
function deepest(files, routesDir, dir) {
	let best;
	let bestDepth = -1;
	for (const file of files) {
		const fileDir = dirOf(file.file, routesDir);
		if (!isAncestorDir(fileDir, dir)) continue;
		const depth = depthOf(fileDir);
		if (depth > bestDepth) {
			best = file;
			bestDepth = depth;
		}
	}
	return best;
}
/**
* Collects the middleware and layout chain (root first) and the nearest `_app`
* / `_error` for a routes directory.
*/
function resolveSpecialChains(routes, routesDir, dir) {
	const layouts = byDir(routes.filter((r) => r.kind === "layout"), routesDir);
	const middlewares = byDir(routes.filter((r) => r.kind === "middleware"), routesDir);
	const chain = (map) => {
		const out = [];
		for (const d of dirsUpTo(dir)) {
			const list = map.get(d);
			if (list !== void 0) out.push(...list);
		}
		return out;
	};
	return {
		middlewares: chain(middlewares),
		layouts: chain(layouts),
		app: deepest(routes.filter((r) => r.kind === "app"), routesDir, dir),
		error: deepest(routes.filter((r) => r.kind === "error"), routesDir, dir)
	};
}
/**
* Resolves every route file against the special files (`_app`, `_layout`,
* `_middleware`, `_error`) that apply to it.
*/
function resolveRoutes(routes, routesDir) {
	return {
		routes: sortRouteFiles(routes.filter((r) => r.kind === "route")).map((file) => {
			const dir = dirOf(file.file, routesDir);
			const pattern = parseUrlPath(file.urlPath);
			const chains = resolveSpecialChains(routes, routesDir, dir);
			return {
				file,
				honoPatterns: pattern.honoPatterns,
				params: pattern.params,
				pattern,
				middlewares: chains.middlewares,
				layouts: chains.layouts,
				app: chains.app,
				error: chains.error
			};
		}),
		notFound: routes.filter((r) => r.kind === "notFound").sort((a, b) => depthOf(dirOf(b.file, routesDir)) - depthOf(dirOf(a.file, routesDir))).map((file) => ({
			file,
			matchers: [compilePrefixMatcher(parseUrlPath(file.urlPath))]
		}))
	};
}
/**
* Builds a synthetic route for requests that matched no route file, so that
* the 404 / error pages can still use the layouts and app shell of that
* directory. `dir` is the routes-relative directory of the `_404` page that
* applies (or `""` for the root).
*/
function unmatchedRoute(routes, routesDir, dir, urlPath) {
	const chains = resolveSpecialChains(routes, routesDir, dir);
	return {
		file: {
			file: `${routesDir}${dir === "" ? "" : "/" + dir}/_404`,
			kind: "notFound",
			urlPath
		},
		honoPatterns: [],
		params: [],
		pattern: parseUrlPath(urlPath),
		middlewares: chains.middlewares,
		layouts: chains.layouts,
		app: chains.app,
		error: chains.error
	};
}
var init_fs_routes = __esmMin((() => {
	init_path_to_pattern();
}));
//#endregion
//#region ../core/dist/app.js
function htmlResponse(c, outcome) {
	if (outcome.links.length > 0) c.header("Link", outcome.links.map((url) => `<${url}>; rel=modulepreload`).join(", "));
	if (typeof outcome.body === "string") return c.html(outcome.body, outcome.status);
	return c.body(outcome.body, outcome.status, { "Content-Type": "text/html; charset=UTF-8" });
}
function pickHandler(handlers, method) {
	if (handlers === void 0) return void 0;
	if (method === "HEAD" && handlers.HEAD === void 0) return handlers.GET;
	return handlers[method];
}
/**
* Runs a directory-scoped middleware chain, ending in `terminal`. The
* middlewares are Hono middlewares, so Hono's semantics apply, with one
* ergonomic extension: returning a `Response` short circuits, and a middleware
* that never calls `next()` continues the chain.
*/
async function runRouteMiddleware(list, c, terminal) {
	const dispatch = async (index) => {
		if (index >= list.length) return await terminal();
		const fn = list[index];
		let downstream;
		let called = false;
		const next = async () => {
			if (called) throw new Error("next() called multiple times");
			called = true;
			downstream = await dispatch(index + 1);
		};
		const result = await fn(c, next);
		if (result instanceof Response) {
			c.res = result;
			return result;
		}
		if (called && downstream !== void 0) return downstream;
		return await dispatch(index + 1);
	};
	return await dispatch(0);
}
/**
* Loads the `_middleware.ts` files scoped to a route's directory, root first.
* Modules that do not export a middleware are skipped with a warning.
*/
async function loadMiddleware(route, internals) {
	const list = [];
	for (const spec of route.middlewares) {
		const middlewareModule = await internals.loader.load(spec);
		const middleware = middlewareModule.default ?? middlewareModule.middleware;
		if (typeof middleware !== "function") {
			internals.config.logger.warn(`hum: ${spec.file} does not export a middleware as its default export. Skipping it.`);
			continue;
		}
		list.push(middleware);
	}
	return list;
}
/**
* Mounts Hum's file routes, 404 handling, and runtime state onto an existing
* Hono application.
*
* The routes, the islands and the production assets come from the build that
* `defineBuild` registered — the Vite plugin generates the module that does it,
* so an app only has to import it. Application middleware registered before
* this call also wraps Hum routes.
*
* An app is mounted once. Hono builds its router when the first request matches
* on it and takes no route after that, so a runtime that re-runs the module
* which mounts the app mounts onto an app of its own — see `ALREADY_MOUNTED`.
*/
async function mountHum(app, config) {
	if (app.hum !== void 0) throw new TypeError(ALREADY_MOUNTED);
	const build = humBuild();
	const prod = build.prod;
	const dev = config.dev ?? prod === null;
	const resolved = resolveConfig({
		...config,
		dev
	});
	const buildCache = new BuildCache(dev);
	buildCache.load(build);
	const { routes, notFound } = resolveRoutes(build.routes, resolved.routesDir);
	const loader = new ModuleLoader(dev);
	if (prod === null && config.dev !== true) resolved.logger.error("hum: the registered build carries no production assets. Client islands and styles cannot be served; run the production build, whose generated module records them, or set `dev: true` to run from source on purpose.");
	const internals = {
		config: resolved,
		build,
		buildCache,
		loader,
		routes,
		notFound,
		async refresh() {
			if (!resolved.dev) return;
			buildCache.load(build);
		}
	};
	const register = app.all.bind(app);
	for (const route of routes) {
		const chain = routeHandler(route, internals, notFound);
		for (const pattern of route.honoPatterns) register(pattern, chain);
	}
	app.notFound(async (c) => {
		const url = new URL(c.req.url);
		const context = c;
		const found = findNotFound(notFound, url.pathname);
		const dir = found === void 0 ? "" : dirOf(found.file.file, resolved.routesDir);
		const route = unmatchedRoute(build.routes, resolved.routesDir, dir, url.pathname);
		const input = {
			config: resolved,
			buildCache,
			loader,
			route,
			url,
			params: {},
			state: c.var,
			notFound
		};
		try {
			await internals.refresh();
			const middleware = await loadMiddleware(route, internals);
			const terminal = async () => htmlResponse(context, await renderNotFound(input, url.pathname));
			return await runRouteMiddleware(middleware, context, terminal);
		} catch (err) {
			return htmlResponse(context, await renderError(input, err));
		}
	});
	return Object.assign(app, { hum: internals });
}
function routeHandler(route, internals, notFound) {
	return async (c) => {
		const url = new URL(c.req.url);
		const method = c.req.method.toUpperCase();
		const params = c.req.param();
		const context = c;
		context.set("humRoute", route);
		const input = {
			config: internals.config,
			buildCache: internals.buildCache,
			loader: internals.loader,
			route,
			url,
			params,
			state: c.var,
			notFound
		};
		try {
			await internals.refresh();
			const mod = await internals.loader.load(route.file);
			const routeMiddleware = await loadMiddleware(route, internals);
			const terminal = async () => {
				const handler = pickHandler(mod.handlers, method);
				if (handler !== void 0) {
					const res = await runWithRequestContext({ page: async (data, options) => htmlResponse(context, await renderRoute(input, data, options)) }, () => handler(context));
					if (res instanceof Response) return res;
				} else if (mod.handlers !== void 0 && method !== "GET" && method !== "HEAD") return context.text("Method Not Allowed", 405);
				return htmlResponse(context, await renderRoute(input));
			};
			return await runRouteMiddleware(routeMiddleware, context, terminal);
		} catch (err) {
			if (route.error === void 0) internals.config.logger.error(`hum: unhandled error while handling ${context.req.method} ${url.pathname}`, err);
			return htmlResponse(context, await renderError(input, err));
		}
	};
}
var ALREADY_MOUNTED;
var init_app = __esmMin((() => {
	init_dist$2();
	init_build();
	init_build_cache();
	init_config();
	init_loader();
	init_request_context();
	init_render();
	init_fs_routes();
	ALREADY_MOUNTED = "hum: this Hono app is already mounted, and Hono takes no further route once a request has matched on its router. Mount on an app of your own instead of on the app you imported, so a runtime that re-runs the mounting module can mount again: `const app = new Hono(); app.route(\"/\", userApp); await mountHum(app, config)`.";
}));
/**
* Hum does not look for routes, islands or client assets by itself: only a
* bundler can turn a project's files into modules — resolving imports,
* transforming JSX, splitting chunks — so the build the bundler produced is its
* input, registered through `defineBuild`. The runtime never reads the file
* system behind its back to reconstruct any of it, which is what lets a
* platform without one run the same code.
*/
//#endregion
//#region ../core/dist/define.js
function createDefine() {
	return {
		route: (module) => module,
		head: (head) => head,
		config: (config) => config,
		page: (component) => component,
		app: (module) => module,
		layout: (module) => module,
		error: (module) => module,
		handlers: (handlers) => handlers,
		middleware: (middleware) => middleware
	};
}
var define;
var init_define = __esmMin((() => {
	define = createDefine();
}));
//#endregion
//#region ../../node_modules/.pnpm/preact@11.0.1_preact-render-to-string@6.8.0/node_modules/preact/hooks/dist/hooks.mjs
function y$2(n, t) {
	a$1.__h && a$1.__h(r$1, n, f$2 || t), f$2 = 0;
	var u = r$1.__H || (r$1.__H = {
		__: [],
		__h: []
	});
	return n >= u.__.length && u.__.push({}), u.__[n];
}
function b$2(n, r) {
	var u = y$2(t$1++, 7);
	return E$1(u.__H, r) && (u.__ = n(), u.__H = r), u.__;
}
function g$2() {
	var n;
	do {
		for (; n = e$1.shift();) try {
			C(n);
		} catch (t) {
			a$1.__e(t, { __: (n = n.__P) && n.__v });
		}
		for (; n = c$1.shift();) {
			var t = n.__H;
			if (n.__P && t) try {
				t.__h.some(C), t.__h.some(D), t.__h = [];
			} catch (r) {
				t.__h = [], a$1.__e(r, n.__v);
			}
		}
	} while (e$1.length);
}
function z$1(n) {
	var t, r = function() {
		clearTimeout(u), k && cancelAnimationFrame(t), setTimeout(n);
	}, u = setTimeout(r, 35);
	k && (t = requestAnimationFrame(r));
}
function B(n) {
	1 != n && i$1 == a$1.requestAnimationFrame || ((i$1 = a$1.requestAnimationFrame) || z$1)(g$2);
}
function C(n) {
	var t = r$1, u = n.__c;
	"function" == typeof u && (n.__c = void 0, u()), r$1 = t;
}
function D(n) {
	var t = r$1;
	n.__c = n.__(), r$1 = t;
}
function E$1(n, t) {
	return !n || n.length != t.length || t.some(function(t, r) {
		return !o$2(t, n[r]);
	});
}
var t$1, r$1, u$2, i$1, o$2, f$2, c$1, e$1, a$1, v$1, l$1, m$2, s$1, h$2, p$2, k;
var init_hooks = __esmMin((() => {
	init_preact();
	o$2 = Object.is;
	f$2 = 0;
	c$1 = [];
	e$1 = [];
	a$1 = n$2;
	v$1 = a$1.__b;
	l$1 = a$1.__r;
	m$2 = a$1.diffed;
	s$1 = a$1.__c;
	h$2 = a$1.unmount;
	p$2 = a$1.__;
	a$1.__b = function(n) {
		r$1 = null, v$1 && v$1(n);
	}, a$1.__ = function(n, t) {
		n && t.__k && t.__k.__m && (n.__m = t.__k.__m), p$2 && p$2(n, t);
	}, a$1.__r = function(n) {
		l$1 && l$1(n), t$1 = 0;
		var i = (r$1 = n.__c).__H;
		i && (u$2 == r$1 ? r$1.__h = [] : (i.__h.some(C), i.__h.some(D), t$1 = 0), i.__h = [], i.__.some(function(n) {
			n.__N && (n.__ = n.__N), n.u = n.__N = void 0;
		})), u$2 = r$1;
	}, a$1.diffed = function(n) {
		m$2 && m$2(n);
		var t = n.__c;
		t && t.__H && (t.__H.__h.length && B(c$1.push(t)), t.__H.__.some(function(n) {
			n.u && (n.__H = n.u);
		})), u$2 = r$1 = null;
	}, a$1.__c = function(n, t) {
		t.some(function(n) {
			try {
				n.__h.some(C), n.__h = n.__h.filter(function(n) {
					return !n.__ || D(n);
				});
			} catch (r) {
				t.some(function(n) {
					n.__h && (n.__h = []);
				}), t = [], a$1.__e(r, n.__v);
			}
		}), s$1 && s$1(n, t);
	}, a$1.unmount = function(n) {
		h$2 && h$2(n);
		var t, r, u = n.__c;
		u && u.__H && (u.__H.__.some(function(u) {
			try {
				if (u.__P && u.__c) {
					if (void 0 === r) {
						for (r = n.__; r && (!r.__c || !r.__c.__P);) r = r.__;
						r = r && r.__c;
					}
					u.__P = r, B(e$1.push(u));
				} else C(u);
			} catch (n) {
				t = n;
			}
		}), u.__H = void 0, t && a$1.__e(t, u.__v));
	};
	k = "function" == typeof requestAnimationFrame;
}));
//#endregion
//#region ../../node_modules/.pnpm/preact@11.0.1_preact-render-to-string@6.8.0/node_modules/preact/compat/dist/compat.mjs
function en(n, t, e) {
	if (n) {
		var r = n.__c && n.__c.__H;
		r && (r.__.forEach(function(n) {
			null != n.__P && ("function" == typeof n.__c && n.__c(), n.__c = n.__H = void 0);
		}), r.__h = n.__c.__h = []), "string" == typeof n.type && (n.__u |= 8), null != (n = w$2({ constructor: void 0 }, n)).__c && (n.__c.__P == e && (n.__c.__P = t), n.__c.__g |= 4, n.__c = n.ref = null), n.__k = n.__k && n.__k.map(function(n) {
			return en(n, t, e);
		});
	}
	return n;
}
function rn(n, t, e) {
	return n && e && ("string" == typeof n.type && (n.__u |= 1), n.__v = null, n.__k = n.__k && n.__k.map(function(n) {
		return rn(n, t, e);
	}), n.__c && n.__c.__P == t && (n.__e && e.appendChild(n.__e), n.__c.__g |= 4, n.__c.__P = e)), n;
}
function un() {
	function n() {
		this.__u = 0, this.i = null, this.__b = null;
	}
	return function() {
		var n = n$2.__e;
		n$2.__e = function(t, e, r, u) {
			if (t.then) {
				for (var i, o = e; o = o.__;) if ((i = o.__c) && i.__c) return r && !r.__c && (e.__c.__H = void 0), i.__c(t, e);
			}
			n(t, e, r, u);
		};
		var t = n$2.unmount;
		n$2.unmount = function(n) {
			var e = n.__c;
			e && e.__R && e.__R(), t && t(n);
		};
	}(), (n.prototype = new $$3()).__c = function(n, t) {
		var e = this, r = t.__c;
		this.i ??= [], this.i.push(r);
		var u = !1, i = function() {
			!u && e.__P && (u = !0, r.__R = null, f());
		};
		r.__R = i;
		var o = r.__P;
		r.__P = null;
		var f = function() {
			if (!--e.__u) {
				if (e.state.__a) {
					var n = e.state.__a;
					e.__v.__k[0] = rn(n, n.__c.__P, n.__c.__O);
				}
				var t;
				for (e.setState({ __a: e.__b = null }); t = e.i.pop();) t.__P = o, t.forceUpdate();
			}
		};
		this.__u++ || 32 & t.__u || this.setState({ __a: this.__b = this.__v.__k[0] }), n.then(i, i);
	}, n.prototype.componentWillUnmount = function() {
		this.i = [], this.state.__a && (this.__v.__k[0] = this.state.__a);
	}, n.prototype.render = function(n, t) {
		if (this.__b) {
			if (this.__v.__k) {
				var r = document.createElement("div"), u = this.__v.__k[0].__c;
				this.__v.__k[0] = en(this.__b, r, u.__O = u.__P);
			}
			this.__b = null;
		}
		return [g$5(M$2, null, t.__a ? null : n.children), t.__a && g$5(M$2, null, n.fallback)];
	}, n;
}
var w$2, x$2, P, $, z, H, Y, J, K, Q, on;
var init_compat = __esmMin((() => {
	init_preact();
	init_hooks();
	init_hooks();
	w$2 = Object.assign;
	x$2 = /^(-|f[lo].*[^se]$|g.{5,}[^ps]$|z|o[pr]|(W.{5})?[lL]i.*(t|mp)$|an|(bo|s).{4}Im|sca|m.{6}[ds]|ta|c.*[st]$|wido|ini)/;
	P = Symbol.for("react.element");
	$ = /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|image(?!S)|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|transform|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/;
	z = /[A-Z0-9]/g;
	H = typeof document < "u";
	Y = function(n) {
		return /fil|che|rad/.test(n);
	};
	$$3.prototype.isReactComponent = !0, [
		"componentWillMount",
		"componentWillReceiveProps",
		"componentWillUpdate"
	].forEach(function(n) {
		Object.defineProperty($$3.prototype, n, {
			configurable: !0,
			get: function() {
				return this["UNSAFE_" + n];
			},
			set: function(t) {
				Object.defineProperty(this, n, {
					configurable: !0,
					writable: !0,
					value: t
				});
			}
		});
	});
	J = n$2.event;
	n$2.event = function(n) {
		return J && (n = J(n)), n.persist = function() {}, n.isPropagationStopped = function() {
			return this.cancelBubble;
		}, n.isDefaultPrevented = function() {
			return this.defaultPrevented;
		}, n.nativeEvent = n;
	};
	K = {
		configurable: !0,
		get: function() {
			return this.class;
		}
	};
	Q = n$2.vnode;
	n$2.vnode = function(t) {
		if ("string" == typeof t.type) (function(t) {
			var e = t.props, r = t.type, u = {}, i = -1 == r.indexOf("-");
			for (var o in e) {
				var f = e[o];
				if (!("value" == o && "defaultValue" in e && null == f || H && "children" == o && "noscript" == r || "class" == o || "className" == o)) {
					if ("style" == o && "object" == typeof f) {
						var c = void 0;
						for (var a in f) "number" != typeof f[a] || x$2.test(a) || (c || (c = f = w$2({}, f)), f[a] += "px");
					} else if ("defaultValue" == o && "value" in e && null == e.value) o = "value";
					else if ("download" == o && !0 === f) f = "";
					else if ("translate" == o && "no" === f) f = !1;
					else if ("o" == o[0] && "n" == o[1]) {
						var l = o.toLowerCase();
						"ondoubleclick" == l ? o = "ondblclick" : "onchange" != l || "input" != r && "textarea" != r || Y(e.type) ? "onfocus" == l ? o = "onfocusin" : "onblur" == l && (o = "onfocusout") : l = o = "oninput", "oninput" == l && u[o = l] && (o = "oninputCapture");
					} else i && $.test(o) ? o = o.replace(z, "-$&").toLowerCase() : null === f && (f = void 0);
					u[o] = f;
				}
			}
			"select" == r && (u.multiple && Array.isArray(u.value) && (u.value = A$1(e.children).forEach(function(n) {
				n.props.selected = -1 != u.value.indexOf(n.props.value);
			})), null != u.defaultValue && (u.value = A$1(e.children).forEach(function(n) {
				n.props.selected = u.multiple ? -1 != u.defaultValue.indexOf(n.props.value) : u.defaultValue == n.props.value;
			}))), e.class && !e.className ? (u.class = e.class, Object.defineProperty(u, "className", K)) : e.className && (u.class = u.className = e.className), t.props = u;
		})(t);
		else if ("function" == typeof t.type && ("ref" in t.props && "prototype" in t.type && t.type.prototype.render && (t.ref = t.props.ref, delete t.props.ref), t.type.defaultProps)) {
			var e = w$2({}, t.props);
			for (var r in t.type.defaultProps) void 0 === e[r] && (e[r] = t.type.defaultProps[r]);
			t.props = e;
		}
		t.ref && !("ref" in t.props) && Object.defineProperty(t.props, "ref", {
			value: t.ref,
			configurable: !0,
			writable: !0
		}), t.$$typeof = P, Q && Q(t);
	};
	on = /* @__PURE__ */ un();
}));
//#endregion
//#region ../core/dist/resource.js
function ResourceValue({ value, children }) {
	return children(value);
}
function ResourceContent({ resource, children, errorFallback }) {
	let value;
	try {
		value = resource.read();
	} catch (error) {
		if (error !== null && (typeof error === "object" || typeof error === "function") && "then" in error && typeof error.then === "function") throw error;
		return typeof errorFallback === "function" ? errorFallback(error) : errorFallback;
	}
	return g$5(ResourceErrorBoundary, { errorFallback }, g$5(ResourceValue, {
		value,
		children
	}));
}
/**
* Suspends while the resource is pending and renders `errorFallback` if it
* rejects or a child throws during rendering. Use `fallback` for the pending
* state.
*/
function Suspense(props) {
	function Content() {
		return ResourceContent(props);
	}
	return g$5(on, { fallback: props.fallback }, g$5(Content, {}));
}
/**
* Wraps a promise for use with Preact Suspense. Call `read()` during component
* rendering: it throws the pending promise, returns a resolved value, or throws
* the rejection reason.
*/
function createResource(promise) {
	let state = {
		status: "pending",
		promise: Promise.resolve()
	};
	state = {
		status: "pending",
		promise: Promise.resolve(promise).then((value) => {
			state = {
				status: "resolved",
				value
			};
		}, (error) => {
			state = {
				status: "rejected",
				error
			};
		})
	};
	return { read() {
		switch (state.status) {
			case "pending": throw state.promise;
			case "resolved": return state.value;
			case "rejected": throw state.error;
		}
	} };
}
var ResourceErrorBoundary;
var init_resource = __esmMin((() => {
	init_preact();
	init_compat();
	ResourceErrorBoundary = class extends $$3 {
		state = {
			hasError: false,
			error: void 0
		};
		static getDerivedStateFromError(error) {
			return {
				hasError: true,
				error
			};
		}
		render() {
			if (this.state.hasError) return typeof this.props.errorFallback === "function" ? this.props.errorFallback(this.state.error) : this.props.errorFallback;
			return this.props.children;
		}
	};
}));
//#endregion
//#region ../core/dist/mod.js
var init_dist = __esmMin((() => {
	init_app();
	init_build();
	init_error();
	init_define();
	init_config();
	init_request_context();
	init_resource();
	init_build_cache();
}));
//#endregion
//#region ../core/dist/routing/route_files.js
init_dist();
init_path_to_pattern();
/** Module extensions Hum picks up in both directories. */
var MODULE_EXTENSIONS = [
	".tsx",
	".jsx",
	".ts",
	".js"
];
/** True for files Hum treats as routes or islands. */
function isModuleFile(name) {
	if (name.endsWith(".d.ts")) return false;
	if (name.startsWith(".") || name.startsWith("-")) return false;
	return MODULE_EXTENSIONS.some((ext) => name.endsWith(ext));
}
/** Removes the module extension of a file name, if it has one. */
function stripExtension(name) {
	for (const ext of MODULE_EXTENSIONS) if (name.endsWith(ext)) return name.slice(0, -ext.length);
	return name;
}
/** Maps the basename of a route file to the role it plays in the route tree. */
function classify(basename) {
	switch (basename) {
		case "_app": return "app";
		case "_layout": return "layout";
		case "_middleware": return "middleware";
		case "_404": return "notFound";
		case "_error":
		case "_500": return "error";
		default: return "route";
	}
}
/** Turns an island file path into a marker safe identifier. */
function islandNameOf(relPathNoExt) {
	const name = relPathNoExt.split("/").join("_").replace(/[^A-Za-z0-9_$]/g, "_");
	return /^[0-9]/.test(name) ? "_" + name : name;
}
function normalizeDir(value, fallback) {
	const dir = (value ?? fallback).replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "");
	return dir === "" ? fallback : dir;
}
/** Turns a glob key into the project relative path the manifest stores. */
function globFileOf(key) {
	return key.replace(/\\/g, "/").replace(/^\.?\//, "");
}
/** Path of `file` relative to the directory `dir`, both project relative. */
function relativeTo(file, dir) {
	return file.startsWith(dir + "/") ? file.slice(dir.length + 1) : file;
}
/** A route file of the routes directory, with the module that loads it. */
function routeSpecOf(file, routesDir, load) {
	const relNoExt = stripExtension(relativeTo(file, routesDir));
	const kind = classify(relNoExt.split("/").pop() ?? relNoExt);
	return {
		file,
		kind,
		urlPath: urlPathOf(relNoExt, kind === "route"),
		load
	};
}
/** Directory below `routes/` that holds the islands of its route directory. */
var LOCAL_ISLANDS_DIR = "_islands";
/** Directory that holds helpers, which the glob patterns never descend into. */
var COMPONENTS_DIR = "_components";
/**
* Island name of a project relative module file, or `null` when the file is no
* island: it then lives neither below the islands directory nor below a
* `routes&#47;**&#47;_islands` directory, or it sits in a `_components`
* directory, which the glob patterns never descend into.
*
* The glob result and a bundler's manifest both go through this function, so
* the two cannot name the same file differently.
*/
function islandNameOfFile(file, options = {}) {
	const routesDir = normalizeDir(options.routesDir, "routes");
	const islandsDir = normalizeDir(options.islandsDir, "islands");
	const name = globFileOf(file);
	if (!isModuleFile(name.split("/").pop() ?? name)) return null;
	if (name.startsWith(`${islandsDir}/`)) return islandNameOf(stripExtension(name.slice(islandsDir.length + 1)));
	const prefix = `${routesDir}/`;
	if (!name.startsWith(prefix)) return null;
	const rel = name.slice(prefix.length);
	const directories = rel.split("/").slice(0, -1);
	if (!directories.includes(LOCAL_ISLANDS_DIR)) return null;
	if (directories.includes(COMPONENTS_DIR)) return null;
	return islandNameOf(`local_${stripExtension(rel)}`);
}
function sortedModules(modules) {
	return Object.entries(modules).map(([key, load]) => [globFileOf(key), load]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}
/**
* Builds the route and island specs {@link defineBuild} registers from the
* results of the `import.meta.glob` calls of {@link globPatterns}, using the
* same naming rules as the file system crawler.
*/
function specsFromGlob(options) {
	const routesDir = normalizeDir(options.routesDir, "routes");
	const islandsDir = normalizeDir(options.islandsDir, "islands");
	const routes = [];
	for (const [file, load] of sortedModules(options.routeModules)) routes.push(routeSpecOf(file, routesDir, load));
	const islands = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (file, load) => {
		const name = islandNameOfFile(file, {
			routesDir,
			islandsDir
		});
		if (name === null) return;
		if (seen.has(name)) {
			options.logger?.warn(`hum: two island files map to the same island name "${name}". Rename one of them so markers stay unambiguous.`);
			return;
		}
		seen.add(name);
		islands.push({
			name,
			exportName: "default",
			file,
			load
		});
	};
	for (const [file, load] of sortedModules(options.islandModules)) push(file, load);
	for (const [file, load] of sortedModules(options.localIslandModules)) push(file, load);
	return {
		routes,
		islands
	};
}
//#endregion
//#region ../core/dist/routing/mod.js
init_fs_routes();
init_island_tag();
init_path_to_pattern();
//#endregion
//#region ../../node_modules/.pnpm/preact@11.0.1_preact-render-to-string@6.8.0/node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs
function u$1(t, e, n, f, u, i) {
	e || (e = {});
	var a, c, l = e;
	if ("ref" in l && "function" != typeof t) for (c in l = {}, e) "ref" == c ? a = e[c] : l[c] = e[c];
	var p = {
		type: t,
		props: l,
		key: n,
		ref: a,
		__k: null,
		__: null,
		__b: 0,
		__e: null,
		__c: null,
		constructor: void 0,
		__v: --o$1,
		__i: -1,
		__u: 0
	};
	return (u || i) && (p.__source = u, p.__self = i), n$2.vnode && n$2.vnode(p), p;
}
var o$1;
var init_jsxRuntime = __esmMin((() => {
	init_preact();
	o$1 = 0;
	Array.isArray;
}));
//#endregion
//#region routes/_404.tsx
var _404_exports = /* @__PURE__ */ __exportAll({ default: () => NotFound });
function NotFound() {
	return /* @__PURE__ */ u$1("h1", { children: "404 — not found" });
}
var init__404 = __esmMin((() => {
	init_jsxRuntime();
}));
//#endregion
//#region routes/_app.tsx
var _app_exports = /* @__PURE__ */ __exportAll({
	default: () => App,
	head: () => head$8
});
/** Document shell. Head tags are injected where Hum sees a `<head>`. */
function App({ children }) {
	return /* @__PURE__ */ u$1("html", {
		lang: "en",
		children: [/* @__PURE__ */ u$1("head", { children: /* @__PURE__ */ u$1("meta", { charSet: "utf-8" }) }), /* @__PURE__ */ u$1("body", { children })]
	});
}
var THEME_SCRIPT, head$8;
var init__app = __esmMin((() => {
	init_jsxRuntime();
	THEME_SCRIPT = `try {
  const stored = localStorage.getItem("hum-theme");
  document.documentElement.classList.toggle(
    "dark",
    stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches,
  );
} catch {}`;
	head$8 = /* @__PURE__ */ u$1(M$2, { children: [
		/* @__PURE__ */ u$1("meta", {
			name: "viewport",
			content: "width=device-width, initial-scale=1"
		}),
		/* @__PURE__ */ u$1("title", { children: "Hum demo" }),
		/* @__PURE__ */ u$1("script", { dangerouslySetInnerHTML: { __html: THEME_SCRIPT } })
	] });
}));
//#endregion
//#region routes/_error.tsx
var _error_exports = /* @__PURE__ */ __exportAll({ default: () => ErrorPage });
function ErrorPage({ error, status }) {
	return /* @__PURE__ */ u$1("section", { children: [/* @__PURE__ */ u$1("h1", { children: ["Error ", status ?? 500] }), /* @__PURE__ */ u$1("pre", { children: error instanceof Error ? error.message : String(error ?? "") })] });
}
var init__error = __esmMin((() => {
	init_jsxRuntime();
}));
//#endregion
//#region ../core/dist/shared.js
var init_shared = __esmMin((() => {
	init_shared$1();
}));
//#endregion
//#region ../../node_modules/.pnpm/@preact+signals-core@1.14.4/node_modules/@preact/signals-core/dist/signals-core.mjs
function t() {
	if (e > 1) {
		e--;
		return;
	}
	let i, t = !1;
	(function() {
		let i = f;
		f = void 0;
		while (void 0 !== i) {
			const t = i.S;
			if (t.v === i.v) {
				for (let n = t.t; void 0 !== n; n = n.x) if (n.i === i.i) n.i = t.i;
			}
			i = i.o;
		}
	})();
	while (void 0 !== h$1) {
		let n = h$1;
		h$1 = void 0;
		c++;
		while (void 0 !== n) {
			const o = n.u;
			n.u = void 0;
			n.f &= -3;
			if (!(8 & n.f) && w$1(n)) try {
				n.c();
			} catch (n) {
				if (!t) {
					i = n;
					t = !0;
				}
			}
			n = o;
		}
	}
	c = 0;
	e--;
	if (t) throw i;
}
function n(i) {
	if (e > 0) return i();
	d$1 = ++u;
	e++;
	try {
		return i();
	} finally {
		t();
	}
}
function r(i) {
	const t = o, n = s;
	o = void 0;
	s = void 0;
	try {
		return i();
	} finally {
		o = t;
		s = n;
	}
}
function l(i) {
	if (void 0 === o) return;
	let t = i.n;
	if (void 0 === t || t.t !== o) {
		t = {
			i: 0,
			S: i,
			p: o.s,
			n: void 0,
			t: o,
			e: void 0,
			x: void 0,
			r: t
		};
		if (void 0 !== o.s) o.s.n = t;
		o.s = t;
		i.n = t;
		if (32 & o.f) i.S(t);
		return t;
	} else if (-1 === t.i) {
		t.i = 0;
		if (void 0 !== t.n) {
			t.n.p = t.p;
			if (void 0 !== t.p) t.p.n = t.n;
			t.p = o.s;
			t.n = void 0;
			o.s.n = t;
			o.s = t;
		}
		return t;
	}
}
function a(i, t) {
	this.v = i;
	this.i = 0;
	this.n = void 0;
	this.t = void 0;
	this.l = 0;
	this.W = null == t ? void 0 : t.watched;
	this.Z = null == t ? void 0 : t.unwatched;
	this.name = null == t ? void 0 : t.name;
}
function y$1(i, t) {
	return new a(i, t);
}
function w$1(i) {
	for (let t = i.s; void 0 !== t; t = t.n) if (t.S.i !== t.i || !t.S.h() || t.S.i !== t.i) return !0;
	return !1;
}
function _$1(i) {
	for (let t = i.s; void 0 !== t; t = t.n) {
		const n = t.S.n;
		if (void 0 !== n) t.r = n;
		t.S.n = t;
		t.i = -1;
		if (void 0 === t.n) {
			i.s = t;
			break;
		}
	}
}
function b$1(i) {
	let t, n = i.s;
	while (void 0 !== n) {
		const i = n.p;
		if (-1 === n.i) {
			n.S.U(n);
			if (void 0 !== i) i.n = n.n;
			if (void 0 !== n.n) n.n.p = i;
		} else t = n;
		n.S.n = n.r;
		if (void 0 !== n.r) n.r = void 0;
		n = i;
	}
	i.s = t;
}
function p$1(i, t) {
	a.call(this, void 0, t);
	this.x = i;
	this.s = void 0;
	this.g = v - 1;
	this.f = 4;
}
function g$1(i, t) {
	return new p$1(i, t);
}
function S(i) {
	const n = i.m;
	i.m = void 0;
	if ("function" == typeof n) {
		e++;
		const s = o;
		o = void 0;
		try {
			n();
		} catch (t) {
			i.f &= -2;
			i.f |= 8;
			m$1(i);
			throw t;
		} finally {
			o = s;
			t();
		}
	}
}
function m$1(i) {
	for (let t = i.s; void 0 !== t; t = t.n) t.S.U(t);
	i.x = void 0;
	i.s = void 0;
	S(i);
}
function x$1(i) {
	if (o !== this) throw new Error("Out-of-order effect");
	b$1(this);
	o = i;
	this.f &= -2;
	if (8 & this.f) m$1(this);
	t();
}
function E(i, t) {
	this.x = i;
	this.m = void 0;
	this.s = void 0;
	this.u = void 0;
	this.f = 32;
	this.name = null == t ? void 0 : t.name;
	if (s) s.push(this);
}
function j(i, t) {
	const n = new E(i, t);
	try {
		n.c();
	} catch (i) {
		n.d();
		throw i;
	}
	const o = n.d.bind(n);
	o[Symbol.dispose] = o;
	return o;
}
var i, o, s, h$1, f, e, c, u, d$1, v;
var init_signals_core = __esmMin((() => {
	i = Symbol.for("preact-signals");
	e = 0;
	c = 0;
	u = 0;
	d$1 = 0;
	v = 0;
	a.prototype.brand = i;
	a.prototype.h = function() {
		return !0;
	};
	a.prototype.S = function(i) {
		const t = this.t;
		if (t !== i && void 0 === i.e) {
			i.x = t;
			this.t = i;
			if (void 0 !== t) t.e = i;
			else r(() => {
				var i;
				null == (i = this.W) || i.call(this);
			});
		}
	};
	a.prototype.U = function(i) {
		if (void 0 !== this.t) {
			const t = i.e, n = i.x;
			if (void 0 !== t) {
				t.x = n;
				i.e = void 0;
			}
			if (void 0 !== n) {
				n.e = t;
				i.x = void 0;
			}
			if (i === this.t) {
				this.t = n;
				if (void 0 === n) r(() => {
					var i;
					null == (i = this.Z) || i.call(this);
				});
			}
		}
	};
	a.prototype.subscribe = function(i) {
		return j(() => {
			const t = this.value;
			r(() => i(t));
		}, { name: "sub" });
	};
	a.prototype.valueOf = function() {
		return this.value;
	};
	a.prototype.toString = function() {
		return this.value + "";
	};
	a.prototype.toJSON = function() {
		return this.value;
	};
	a.prototype.peek = function() {
		return r(() => this.value);
	};
	Object.defineProperty(a.prototype, "value", {
		get() {
			const i = l(this);
			if (void 0 !== i) i.i = this.i;
			return this.v;
		},
		set(i) {
			if (i !== this.v) {
				if (c > 100) throw new Error("Cycle detected");
				(function(i) {
					if (0 !== e && 0 === c) {
						if (i.l !== d$1) {
							i.l = d$1;
							f = {
								S: i,
								v: i.v,
								i: i.i,
								o: f
							};
						}
					}
				})(this);
				this.v = i;
				this.i++;
				v++;
				e++;
				try {
					for (let i = this.t; void 0 !== i; i = i.x) i.t.N();
				} finally {
					t();
				}
			}
		}
	});
	p$1.prototype = new a();
	p$1.prototype.h = function() {
		this.f &= -3;
		if (1 & this.f) return !1;
		if (32 == (36 & this.f)) return !0;
		this.f &= -5;
		if (this.g === v) return !0;
		this.g = v;
		this.f |= 1;
		if (this.i > 0 && !w$1(this)) {
			this.f &= -2;
			return !0;
		}
		const i = o;
		try {
			_$1(this);
			o = this;
			const i = this.x();
			if (16 & this.f || this.v !== i || 0 === this.i) {
				this.v = i;
				this.f &= -17;
				this.i++;
			}
		} catch (i) {
			this.v = i;
			this.f |= 16;
			this.i++;
		}
		o = i;
		b$1(this);
		this.f &= -2;
		return !0;
	};
	p$1.prototype.S = function(i) {
		if (void 0 === this.t) {
			this.f |= 36;
			for (let i = this.s; void 0 !== i; i = i.n) i.S.S(i);
		}
		a.prototype.S.call(this, i);
	};
	p$1.prototype.U = function(i) {
		if (void 0 !== this.t) {
			a.prototype.U.call(this, i);
			if (void 0 === this.t) {
				this.f &= -33;
				for (let i = this.s; void 0 !== i; i = i.n) i.S.U(i);
			}
		}
	};
	p$1.prototype.N = function() {
		if (!(2 & this.f)) {
			this.f |= 6;
			for (let i = this.t; void 0 !== i; i = i.x) i.t.N();
		}
	};
	Object.defineProperty(p$1.prototype, "value", { get() {
		if (1 & this.f) throw new Error("Cycle detected");
		const i = l(this);
		this.h();
		if (void 0 !== i) i.i = this.i;
		if (16 & this.f) throw this.v;
		return this.v;
	} });
	E.prototype.c = function() {
		const i = this.S();
		try {
			if (8 & this.f) return;
			if (void 0 === this.x) return;
			const t = this.x();
			if ("function" == typeof t) this.m = t;
		} finally {
			i();
		}
	};
	E.prototype.S = function() {
		if (1 & this.f) throw new Error("Cycle detected");
		this.f |= 1;
		this.f &= -9;
		S(this);
		_$1(this);
		e++;
		const i = o;
		o = this;
		return x$1.bind(this, i);
	};
	E.prototype.N = function() {
		if (!(2 & this.f)) {
			this.f |= 2;
			this.u = h$1;
			h$1 = this;
		}
	};
	E.prototype.d = function() {
		this.f |= 8;
		if (!(1 & this.f)) m$1(this);
	};
	E.prototype.dispose = function() {
		this.d();
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/@preact+signals@2.11.3_preact@11.0.1/node_modules/@preact/signals/dist/signals.mjs
function g(t, n) {
	n$2[t] = n.bind(null, n$2[t] || (() => {}));
}
function b(t) {
	if (m) {
		const t = m;
		m = void 0;
		t();
	}
	m = t && t.S();
}
function y({ data: t }) {
	const i = useSignal(t);
	i.name = "ReactiveDom";
	i.value = t;
	const [e, f] = b$2(() => {
		let t = this, e = this.__v;
		while (e = e.__) if (e.__c) {
			e.__c.__$f |= 4;
			break;
		}
		const o = g$1(() => {
			let t = i.value.value;
			return 0 === t ? 0 : !0 === t ? "" : t || "";
		}), f = g$1(() => !Array.isArray(o.value) && !i$4(o.value)), r = j(function() {
			this.N = F;
			if (f.value) {
				const i = o.value;
				if (t.__v && t.__v.__e && 3 === t.__v.__e.nodeType) t.__v.__e.data = i;
			}
		}), c = this.__$u.d;
		this.__$u.d = function() {
			r();
			c.call(this);
		};
		return [f, o];
	}, []);
	return e.value ? f.peek() : f.value;
}
function w(t, i, n, e) {
	const o = i in t && void 0 === t.ownerSVGElement, f = y$1(n);
	return {
		o: (t, i) => {
			f.value = t;
			e = i;
		},
		d: j(function() {
			this.N = F;
			const n = f.value.value;
			if (e[i] !== n) {
				e[i] = n;
				if (o) t[i] = n;
				else if (null != n && (!1 !== n || "-" === i[4])) t.setAttribute(i, n);
				else t.removeAttribute(i);
			}
		})
	};
}
function useSignal(t, i) {
	return b$2(() => y$1(t, i), []);
}
function x() {
	n(() => {
		let t;
		while (t = _.shift()) d.call(t);
	});
}
function F() {
	if (1 === _.push(this)) (n$2.requestAnimationFrame || q)(x);
}
var h, d, m, _, q;
var init_signals = __esmMin((() => {
	init_preact();
	init_hooks();
	init_signals_core();
	h = "undefined" != typeof window && !!window.__PREACT_SIGNALS_DEVTOOLS__;
	_ = [];
	j(function() {
		d = this.N;
	})();
	y.displayName = "ReactiveTextNode";
	Object.defineProperties(a.prototype, {
		constructor: {
			configurable: !0,
			value: void 0
		},
		type: {
			configurable: !0,
			value: y
		},
		props: {
			configurable: !0,
			get() {
				const t = this;
				return { data: { get value() {
					return t.value;
				} } };
			}
		},
		__b: {
			configurable: !0,
			value: 1
		}
	});
	g("__b", (t, i) => {
		b();
		if ("string" == typeof i.type) {
			let t, n = i.props;
			for (let e in n) {
				if ("children" === e) continue;
				let o = n[e];
				if (o instanceof a) {
					if (!t) i.__np = t = {};
					t[e] = o;
					n[e] = o.peek();
				}
			}
		}
		t(i);
	});
	g("__r", (t, i) => {
		t(i);
		if (i.type !== M$2) {
			b();
			let t, n = i.__c;
			if (n) {
				n.__$f &= -2;
				t = n.__$u;
				if (void 0 === t) n.__$u = t = function(t, i) {
					let n;
					j(function() {
						n = this;
					}, { name: i });
					n.c = t;
					return n;
				}(function(t) {
					return function() {
						var i;
						if (h) null == (i = this.y) || i.call(this);
						t.__$f |= 1;
						t.setState({});
					};
				}(n), "function" == typeof i.type ? i.type.displayName || i.type.name : "");
			}
			b(t);
		}
	});
	g("__e", (t, i, n, e) => {
		b();
		t(i, n, e);
	});
	g("diffed", (t, i) => {
		b();
		let n;
		if ("string" == typeof i.type && (n = i.__e)) {
			let t = i.__np, e = i.props, o = n.U;
			if (o) for (let i in o) {
				let n = o[i];
				if (!(void 0 === n || t && i in t)) {
					n.d();
					o[i] = void 0;
				}
			}
			if (t) {
				if (!o) {
					o = {};
					n.U = o;
				}
				for (let i in t) {
					let f = o[i], r = t[i];
					if (void 0 === f) {
						f = w(n, i, r, e);
						o[i] = f;
					} else f.o(r, e);
				}
			}
		}
		t(i);
	});
	g("unmount", (t, i) => {
		if ("string" == typeof i.type) {
			let t = i.__e;
			if (t) {
				const i = t.U;
				if (i) {
					t.U = void 0;
					for (let t in i) {
						let n = i[t];
						if (n) n.d();
					}
				}
			}
			let n = i.__np;
			if (n) {
				let t = i.props;
				for (let i in n) t[i] = n[i];
			}
			i.__np = void 0;
		} else {
			let t = i.__c;
			if (t) {
				t.__$f |= 8;
				const i = t.__$u;
				if (i) {
					t.__$u = void 0;
					i.d();
				}
			}
		}
		t(i);
	});
	g("__h", (t, i, n, e) => {
		if (e < 3) i.__$f |= 2;
		t(i, n, e);
	});
	$$3.prototype.shouldComponentUpdate = function(t, i) {
		if (this.__R) return !0;
		const n = this.__$u, e = n && void 0 !== n.s;
		for (let t in i) return !0;
		if (this.__f || "boolean" == typeof this.u && !0 === this.u) {
			const t = 2 & this.__$f;
			if (!(e || t || 4 & this.__$f)) return !0;
			if (1 & this.__$f) return !0;
		} else {
			if (!(e || 4 & this.__$f)) return !0;
			if (3 & this.__$f) return !0;
		}
		for (let i in t) if ("__source" !== i && t[i] !== this.props[i]) return !0;
		for (let i in this.props) if (!(i in t)) return !0;
		return !1;
	};
	q = (t) => {
		queueMicrotask(() => {
			queueMicrotask(t);
		});
	};
}));
//#endregion
//#region routes/_islands/ThemeToggle.tsx
var ThemeToggle_exports = /* @__PURE__ */ __exportAll({ default: () => __hum_island_default$1 });
var STORAGE_KEY, __hum_island_default$1;
var init_ThemeToggle = __esmMin((() => {
	init_shared();
	init_signals();
	init_jsxRuntime();
	STORAGE_KEY = "hum-theme";
	__hum_island_default$1 = function ThemeToggle() {
		const dark = useSignal(IS_BROWSER && document.documentElement.classList.contains("dark"));
		function toggle() {
			dark.value = !dark.value;
			document.documentElement.classList.toggle("dark", dark.value);
			try {
				localStorage.setItem(STORAGE_KEY, dark.value ? "dark" : "light");
			} catch {}
		}
		return /* @__PURE__ */ u$1("button", {
			type: "button",
			onClick: toggle,
			"aria-pressed": dark.value,
			title: dark.value ? "Switch to the light theme" : "Switch to the dark theme",
			class: "grid size-9 place-items-center rounded-xl border border-line bg-surface text-base transition hover:bg-surface-2",
			children: [/* @__PURE__ */ u$1("span", {
				"aria-hidden": "true",
				children: dark.value ? "☾" : "☀"
			}), /* @__PURE__ */ u$1("span", {
				class: "sr-only",
				children: dark.value ? "Switch to the light theme" : "Switch to the dark theme"
			})]
		});
	};
	if (typeof __hum_island_default$1 === "function" || typeof __hum_island_default$1 === "object" && __hum_island_default$1 !== null) __hum_island_default$1[Symbol.for("hum.island")] = {
		"name": "local__islands_ThemeToggle",
		"file": "routes/_islands/ThemeToggle.tsx",
		"exportName": "default"
	};
}));
//#endregion
//#region routes/docs/_layout.tsx
var _layout_exports = /* @__PURE__ */ __exportAll({ default: () => DocsLayout });
function DocsLayout({ children, url }) {
	const currentPath = url.pathname;
	return /* @__PURE__ */ u$1("div", {
		class: "min-h-screen bg-bg text-fg",
		children: [/* @__PURE__ */ u$1("header", {
			class: "border-b border-line bg-surface-80",
			children: /* @__PURE__ */ u$1("div", {
				class: "mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8",
				children: [/* @__PURE__ */ u$1("a", {
					href: "/",
					class: "flex items-center gap-3",
					"aria-label": "Hum home",
					children: [
						/* @__PURE__ */ u$1("span", {
							class: "grid size-9 place-items-center rounded-xl bg-brand text-lg font-black text-brand-fg",
							children: "夯"
						}),
						/* @__PURE__ */ u$1("span", {
							class: "text-lg font-extrabold tracking-tight",
							children: "Hum"
						}),
						/* @__PURE__ */ u$1("span", {
							class: "ml-1 border-l border-line pl-3 text-sm font-medium text-muted",
							children: "Guides"
						})
					]
				}), /* @__PURE__ */ u$1("div", {
					class: "flex items-center gap-2",
					children: [/* @__PURE__ */ u$1("a", {
						href: "/",
						class: "rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-fg",
						children: ["Back to home ", /* @__PURE__ */ u$1("span", {
							"aria-hidden": "true",
							children: "↗"
						})]
					}), /* @__PURE__ */ u$1(__hum_island_default$1, {})]
				})]
			})
		}), /* @__PURE__ */ u$1("div", {
			class: "mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16 lg:py-14",
			children: [/* @__PURE__ */ u$1("aside", {
				class: "lg:sticky lg:top-8 lg:self-start",
				children: [
					/* @__PURE__ */ u$1("input", {
						id: "docs-nav",
						type: "checkbox",
						class: "peer sr-only"
					}),
					/* @__PURE__ */ u$1("label", {
						for: "docs-nav",
						class: "flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-fg-soft transition peer-checked:border-accent peer-checked:text-accent-strong peer-focus-visible:ring-2 peer-focus-visible:ring-accent lg:hidden",
						children: ["Guides", /* @__PURE__ */ u$1("span", {
							"aria-hidden": "true",
							class: "text-faint",
							children: "▾"
						})]
					}),
					/* @__PURE__ */ u$1("p", {
						class: "mb-3 hidden px-3 text-xs font-bold uppercase tracking-[0.16em] text-faint lg:block",
						children: "Guides"
					}),
					/* @__PURE__ */ u$1("nav", {
						class: "mt-2 hidden flex-col gap-2 peer-checked:flex lg:mt-0 lg:flex",
						children: GUIDES.map((guide) => /* @__PURE__ */ u$1("a", {
							href: guide.href,
							"aria-current": currentPath === guide.href ? "page" : void 0,
							class: ["rounded-xl px-3 py-2.5 text-sm font-semibold transition", currentPath === guide.href ? "bg-accent-bg text-accent-strong" : "text-muted hover:bg-surface hover:text-fg"].join(" "),
							children: guide.label
						}, guide.href))
					})
				]
			}), /* @__PURE__ */ u$1("main", {
				class: "min-w-0 max-w-3xl pb-16",
				children
			})]
		})]
	});
}
var GUIDES;
var init__layout = __esmMin((() => {
	init_ThemeToggle();
	init_jsxRuntime();
	GUIDES = [
		{
			href: "/docs/getting-started",
			label: "Getting started"
		},
		{
			href: "/docs/routing",
			label: "Routing and rendering"
		},
		{
			href: "/docs/hono",
			label: "Hono and Hum middleware"
		},
		{
			href: "/docs/handlers",
			label: "Route handlers"
		},
		{
			href: "/docs/partials",
			label: "Partial page updates"
		},
		{
			href: "/docs/facets",
			label: "Page-level reactivity"
		},
		{
			href: "/docs/streaming",
			label: "Experimental streaming"
		}
	];
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/lib/core.js
var require_core = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function deepFreeze(obj) {
		if (obj instanceof Map) obj.clear = obj.delete = obj.set = function() {
			throw new Error("map is read-only");
		};
		else if (obj instanceof Set) obj.add = obj.clear = obj.delete = function() {
			throw new Error("set is read-only");
		};
		Object.freeze(obj);
		Object.getOwnPropertyNames(obj).forEach((name) => {
			const prop = obj[name];
			const type = typeof prop;
			if ((type === "object" || type === "function") && !Object.isFrozen(prop)) deepFreeze(prop);
		});
		return obj;
	}
	/** @typedef {import('highlight.js').CallbackResponse} CallbackResponse */
	/** @typedef {import('highlight.js').CompiledMode} CompiledMode */
	/** @implements CallbackResponse */
	var Response = class {
		/**
		* @param {CompiledMode} mode
		*/
		constructor(mode) {
			if (mode.data === void 0) mode.data = {};
			this.data = mode.data;
			this.isMatchIgnored = false;
		}
		ignoreMatch() {
			this.isMatchIgnored = true;
		}
	};
	/**
	* @param {string} value
	* @returns {string}
	*/
	function escapeHTML(value) {
		return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
	}
	/**
	* performs a shallow merge of multiple objects into one
	*
	* @template T
	* @param {T} original
	* @param {Record<string,any>[]} objects
	* @returns {T} a single new object
	*/
	function inherit$1(original, ...objects) {
		/** @type Record<string,any> */
		const result = Object.create(null);
		for (const key in original) result[key] = original[key];
		objects.forEach(function(obj) {
			for (const key in obj) result[key] = obj[key];
		});
		return result;
	}
	/**
	* @typedef {object} Renderer
	* @property {(text: string) => void} addText
	* @property {(node: Node) => void} openNode
	* @property {(node: Node) => void} closeNode
	* @property {() => string} value
	*/
	/** @typedef {{scope?: string, language?: string, sublanguage?: boolean}} Node */
	/** @typedef {{walk: (r: Renderer) => void}} Tree */
	/** */
	var SPAN_CLOSE = "</span>";
	/**
	* Determines if a node needs to be wrapped in <span>
	*
	* @param {Node} node */
	var emitsWrappingTags = (node) => {
		return !!node.scope;
	};
	/**
	*
	* @param {string} name
	* @param {{prefix:string}} options
	*/
	var scopeToCSSClass = (name, { prefix }) => {
		if (name.startsWith("language:")) return name.replace("language:", "language-");
		if (name.includes(".")) {
			const pieces = name.split(".");
			return [`${prefix}${pieces.shift()}`, ...pieces.map((x, i) => `${x}${"_".repeat(i + 1)}`)].join(" ");
		}
		return `${prefix}${name}`;
	};
	/** @type {Renderer} */
	var HTMLRenderer = class {
		/**
		* Creates a new HTMLRenderer
		*
		* @param {Tree} parseTree - the parse tree (must support `walk` API)
		* @param {{classPrefix: string}} options
		*/
		constructor(parseTree, options) {
			this.buffer = "";
			this.classPrefix = options.classPrefix;
			parseTree.walk(this);
		}
		/**
		* Adds texts to the output stream
		*
		* @param {string} text */
		addText(text) {
			this.buffer += escapeHTML(text);
		}
		/**
		* Adds a node open to the output stream (if needed)
		*
		* @param {Node} node */
		openNode(node) {
			if (!emitsWrappingTags(node)) return;
			const className = scopeToCSSClass(node.scope, { prefix: this.classPrefix });
			this.span(className);
		}
		/**
		* Adds a node close to the output stream (if needed)
		*
		* @param {Node} node */
		closeNode(node) {
			if (!emitsWrappingTags(node)) return;
			this.buffer += SPAN_CLOSE;
		}
		/**
		* returns the accumulated buffer
		*/
		value() {
			return this.buffer;
		}
		/**
		* Builds a span element
		*
		* @param {string} className */
		span(className) {
			this.buffer += `<span class="${className}">`;
		}
	};
	/** @typedef {{scope?: string, language?: string, children: Node[]} | string} Node */
	/** @typedef {{scope?: string, language?: string, children: Node[]} } DataNode */
	/** @typedef {import('highlight.js').Emitter} Emitter */
	/**  */
	/** @returns {DataNode} */
	var newNode = (opts = {}) => {
		/** @type DataNode */
		const result = { children: [] };
		Object.assign(result, opts);
		return result;
	};
	var TokenTree = class TokenTree {
		constructor() {
			/** @type DataNode */
			this.rootNode = newNode();
			this.stack = [this.rootNode];
		}
		get top() {
			return this.stack[this.stack.length - 1];
		}
		get root() {
			return this.rootNode;
		}
		/** @param {Node} node */
		add(node) {
			this.top.children.push(node);
		}
		/** @param {string} scope */
		openNode(scope) {
			/** @type Node */
			const node = newNode({ scope });
			this.add(node);
			this.stack.push(node);
		}
		closeNode() {
			if (this.stack.length > 1) return this.stack.pop();
		}
		closeAllNodes() {
			while (this.closeNode());
		}
		toJSON() {
			return JSON.stringify(this.rootNode, null, 4);
		}
		/**
		* @typedef { import("./html_renderer").Renderer } Renderer
		* @param {Renderer} builder
		*/
		walk(builder) {
			return this.constructor._walk(builder, this.rootNode);
		}
		/**
		* @param {Renderer} builder
		* @param {Node} node
		*/
		static _walk(builder, node) {
			if (typeof node === "string") builder.addText(node);
			else if (node.children) {
				builder.openNode(node);
				node.children.forEach((child) => this._walk(builder, child));
				builder.closeNode(node);
			}
			return builder;
		}
		/**
		* @param {Node} node
		*/
		static _collapse(node) {
			if (typeof node === "string") return;
			if (!node.children) return;
			if (node.children.every((el) => typeof el === "string")) node.children = [node.children.join("")];
			else node.children.forEach((child) => {
				TokenTree._collapse(child);
			});
		}
	};
	/**
	Currently this is all private API, but this is the minimal API necessary
	that an Emitter must implement to fully support the parser.
	
	Minimal interface:
	
	- addText(text)
	- __addSublanguage(emitter, subLanguageName)
	- startScope(scope)
	- endScope()
	- finalize()
	- toHTML()
	
	*/
	/**
	* @implements {Emitter}
	*/
	var TokenTreeEmitter = class extends TokenTree {
		/**
		* @param {*} options
		*/
		constructor(options) {
			super();
			this.options = options;
		}
		/**
		* @param {string} text
		*/
		addText(text) {
			if (text === "") return;
			this.add(text);
		}
		/** @param {string} scope */
		startScope(scope) {
			this.openNode(scope);
		}
		endScope() {
			this.closeNode();
		}
		/**
		* @param {Emitter & {root: DataNode}} emitter
		* @param {string} name
		*/
		__addSublanguage(emitter, name) {
			/** @type DataNode */
			const node = emitter.root;
			if (name) node.scope = `language:${name}`;
			this.add(node);
		}
		toHTML() {
			return new HTMLRenderer(this, this.options).value();
		}
		finalize() {
			this.closeAllNodes();
			return true;
		}
	};
	/**
	* @param {string} value
	* @returns {RegExp}
	* */
	/**
	* @param {RegExp | string } re
	* @returns {string}
	*/
	function source(re) {
		if (!re) return null;
		if (typeof re === "string") return re;
		return re.source;
	}
	/**
	* @param {RegExp | string } re
	* @returns {string}
	*/
	function lookahead(re) {
		return concat("(?=", re, ")");
	}
	/**
	* @param {RegExp | string } re
	* @returns {string}
	*/
	function anyNumberOfTimes(re) {
		return concat("(?:", re, ")*");
	}
	/**
	* @param {RegExp | string } re
	* @returns {string}
	*/
	function optional(re) {
		return concat("(?:", re, ")?");
	}
	/**
	* @param {...(RegExp | string) } args
	* @returns {string}
	*/
	function concat(...args) {
		return args.map((x) => source(x)).join("");
	}
	/**
	* @param { Array<string | RegExp | Object> } args
	* @returns {object}
	*/
	function stripOptionsFromArgs(args) {
		const opts = args[args.length - 1];
		if (typeof opts === "object" && opts.constructor === Object) {
			args.splice(args.length - 1, 1);
			return opts;
		} else return {};
	}
	/** @typedef { {capture?: boolean} } RegexEitherOptions */
	/**
	* Any of the passed expresssions may match
	*
	* Creates a huge this | this | that | that match
	* @param {(RegExp | string)[] | [...(RegExp | string)[], RegexEitherOptions]} args
	* @returns {string}
	*/
	function either(...args) {
		return "(" + (stripOptionsFromArgs(args).capture ? "" : "?:") + args.map((x) => source(x)).join("|") + ")";
	}
	/**
	* @param {RegExp | string} re
	* @returns {number}
	*/
	function countMatchGroups(re) {
		return new RegExp(re.toString() + "|").exec("").length - 1;
	}
	/**
	* Does lexeme start with a regular expression match at the beginning
	* @param {RegExp} re
	* @param {string} lexeme
	*/
	function startsWith(re, lexeme) {
		const match = re && re.exec(lexeme);
		return match && match.index === 0;
	}
	var BACKREF_RE = new RegExp(either(/\[(?:[^\\\]]|\\.)*\]/, /\(\?<(?![=!])[^>]+>/, /\(\?'[^']+'/, /\(\??/, /\\([1-9][0-9]*)/, /\\./));
	/**
	* @param {(string | RegExp)[]} regexps
	* @param {{joinWith: string}} opts
	* @returns {string}
	*/
	function _rewriteBackreferences(regexps, { joinWith }) {
		let numCaptures = 0;
		return regexps.map((regex) => {
			numCaptures += 1;
			const offset = numCaptures;
			let re = source(regex);
			let out = "";
			while (re.length > 0) {
				const match = BACKREF_RE.exec(re);
				if (!match) {
					out += re;
					break;
				}
				out += re.substring(0, match.index);
				re = re.substring(match.index + match[0].length);
				if (match[0][0] === "\\" && match[1]) out += "\\" + String(Number(match[1]) + offset);
				else {
					out += match[0];
					if (match[0] === "(" || /^\(\?[<']/.test(match[0])) numCaptures++;
				}
			}
			return out;
		}).map((re) => `(${re})`).join(joinWith);
	}
	/** @typedef {import('highlight.js').Mode} Mode */
	/** @typedef {import('highlight.js').ModeCallback} ModeCallback */
	var MATCH_NOTHING_RE = /\b\B/;
	var IDENT_RE = "[a-zA-Z]\\w*";
	var UNDERSCORE_IDENT_RE = "[a-zA-Z_]\\w*";
	var NUMBER_RE = "\\b\\d+(\\.\\d+)?";
	var C_NUMBER_RE = "(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)";
	var BINARY_NUMBER_RE = "\\b(0b[01]+)";
	var RE_STARTERS_RE = "!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~";
	/**
	* @param { Partial<Mode> & {binary?: string | RegExp} } opts
	*/
	var SHEBANG = (opts = {}) => {
		const beginShebang = /^#![ ]*\//;
		if (opts.binary) opts.begin = concat(beginShebang, /.*\b/, opts.binary, /\b.*/);
		return inherit$1({
			scope: "meta",
			begin: beginShebang,
			end: /$/,
			relevance: 0,
			/** @type {ModeCallback} */
			"on:begin": (m, resp) => {
				if (m.index !== 0) resp.ignoreMatch();
			}
		}, opts);
	};
	var BACKSLASH_ESCAPE = {
		begin: "\\\\[\\s\\S]",
		relevance: 0
	};
	var APOS_STRING_MODE = {
		scope: "string",
		begin: "'",
		end: "'",
		illegal: "\\n",
		contains: [BACKSLASH_ESCAPE]
	};
	var QUOTE_STRING_MODE = {
		scope: "string",
		begin: "\"",
		end: "\"",
		illegal: "\\n",
		contains: [BACKSLASH_ESCAPE]
	};
	var PHRASAL_WORDS_MODE = { begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/ };
	/**
	* Creates a comment mode
	*
	* @param {string | RegExp} begin
	* @param {string | RegExp} end
	* @param {Mode | {}} [modeOptions]
	* @returns {Partial<Mode>}
	*/
	var COMMENT = function(begin, end, modeOptions = {}) {
		const mode = inherit$1({
			scope: "comment",
			begin,
			end,
			contains: []
		}, modeOptions);
		mode.contains.push({
			scope: "doctag",
			begin: "[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)",
			end: /(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,
			excludeBegin: true,
			relevance: 0
		});
		const ENGLISH_WORD = either("I", "a", "is", "so", "us", "to", "at", "if", "in", "it", "on", /[A-Za-z]+['](d|ve|re|ll|t|s|n)/, /[A-Za-z]+[-][a-z]+/, /[A-Za-z][a-z]{2,}/);
		mode.contains.push({ begin: concat(/[ ]+/, "(", ENGLISH_WORD, /[.]?[:]?([.][ ]|[ ])/, "){3}") });
		return mode;
	};
	var C_LINE_COMMENT_MODE = COMMENT("//", "$");
	var C_BLOCK_COMMENT_MODE = COMMENT("/\\*", "\\*/");
	var HASH_COMMENT_MODE = COMMENT("#", "$");
	var NUMBER_MODE = {
		scope: "number",
		begin: NUMBER_RE,
		relevance: 0
	};
	var C_NUMBER_MODE = {
		scope: "number",
		begin: C_NUMBER_RE,
		relevance: 0
	};
	var BINARY_NUMBER_MODE = {
		scope: "number",
		begin: BINARY_NUMBER_RE,
		relevance: 0
	};
	var REGEXP_MODE = {
		scope: "regexp",
		begin: /\/(?=[^/\n]*\/)/,
		end: /\/[gimuy]*/,
		contains: [BACKSLASH_ESCAPE, {
			begin: /\[/,
			end: /\]/,
			relevance: 0,
			contains: [BACKSLASH_ESCAPE]
		}]
	};
	var TITLE_MODE = {
		scope: "title",
		begin: IDENT_RE,
		relevance: 0
	};
	var UNDERSCORE_TITLE_MODE = {
		scope: "title",
		begin: UNDERSCORE_IDENT_RE,
		relevance: 0
	};
	var METHOD_GUARD = {
		begin: "\\.\\s*[a-zA-Z_]\\w*",
		relevance: 0
	};
	/**
	* Adds end same as begin mechanics to a mode
	*
	* Your mode must include at least a single () match group as that first match
	* group is what is used for comparison
	* @param {Partial<Mode>} mode
	*/
	var END_SAME_AS_BEGIN = function(mode) {
		return Object.assign(mode, {
			/** @type {ModeCallback} */
			"on:begin": (m, resp) => {
				resp.data._beginMatch = m[1];
			},
			/** @type {ModeCallback} */
			"on:end": (m, resp) => {
				if (resp.data._beginMatch !== m[1]) resp.ignoreMatch();
			}
		});
	};
	var MODES = /*#__PURE__*/ Object.freeze({
		__proto__: null,
		APOS_STRING_MODE,
		BACKSLASH_ESCAPE,
		BINARY_NUMBER_MODE,
		BINARY_NUMBER_RE,
		COMMENT,
		C_BLOCK_COMMENT_MODE,
		C_LINE_COMMENT_MODE,
		C_NUMBER_MODE,
		C_NUMBER_RE,
		END_SAME_AS_BEGIN,
		HASH_COMMENT_MODE,
		IDENT_RE,
		MATCH_NOTHING_RE,
		METHOD_GUARD,
		NUMBER_MODE,
		NUMBER_RE,
		PHRASAL_WORDS_MODE,
		QUOTE_STRING_MODE,
		REGEXP_MODE,
		RE_STARTERS_RE,
		SHEBANG,
		TITLE_MODE,
		UNDERSCORE_IDENT_RE,
		UNDERSCORE_TITLE_MODE
	});
	/**
	@typedef {import('highlight.js').CallbackResponse} CallbackResponse
	@typedef {import('highlight.js').CompilerExt} CompilerExt
	*/
	/**
	* Skip a match if it has a preceding dot
	*
	* This is used for `beginKeywords` to prevent matching expressions such as
	* `bob.keyword.do()`. The mode compiler automatically wires this up as a
	* special _internal_ 'on:begin' callback for modes with `beginKeywords`
	* @param {RegExpMatchArray} match
	* @param {CallbackResponse} response
	*/
	function skipIfHasPrecedingDot(match, response) {
		if (match.input[match.index - 1] === ".") response.ignoreMatch();
	}
	/**
	*
	* @type {CompilerExt}
	*/
	function scopeClassName(mode, _parent) {
		if (mode.className !== void 0) {
			mode.scope = mode.className;
			delete mode.className;
		}
	}
	/**
	* `beginKeywords` syntactic sugar
	* @type {CompilerExt}
	*/
	function beginKeywords(mode, parent) {
		if (!parent) return;
		if (!mode.beginKeywords) return;
		mode.begin = "\\b(" + mode.beginKeywords.split(" ").join("|") + ")(?!\\.)(?=\\b|\\s)";
		mode.__beforeBegin = skipIfHasPrecedingDot;
		mode.keywords = mode.keywords || mode.beginKeywords;
		delete mode.beginKeywords;
		if (mode.relevance === void 0) mode.relevance = 0;
	}
	/**
	* Allow `illegal` to contain an array of illegal values
	* @type {CompilerExt}
	*/
	function compileIllegal(mode, _parent) {
		if (!Array.isArray(mode.illegal)) return;
		mode.illegal = either(...mode.illegal);
	}
	/**
	* `match` to match a single expression for readability
	* @type {CompilerExt}
	*/
	function compileMatch(mode, _parent) {
		if (!mode.match) return;
		if (mode.begin || mode.end) throw new Error("begin & end are not supported with match");
		mode.begin = mode.match;
		delete mode.match;
	}
	/**
	* provides the default 1 relevance to all modes
	* @type {CompilerExt}
	*/
	function compileRelevance(mode, _parent) {
		if (mode.relevance === void 0) mode.relevance = 1;
	}
	var beforeMatchExt = (mode, parent) => {
		if (!mode.beforeMatch) return;
		if (mode.starts) throw new Error("beforeMatch cannot be used with starts");
		const originalMode = Object.assign({}, mode);
		Object.keys(mode).forEach((key) => {
			delete mode[key];
		});
		mode.keywords = originalMode.keywords;
		mode.begin = concat(originalMode.beforeMatch, lookahead(originalMode.begin));
		mode.starts = {
			relevance: 0,
			contains: [Object.assign(originalMode, { endsParent: true })]
		};
		mode.relevance = 0;
		delete originalMode.beforeMatch;
	};
	var COMMON_KEYWORDS = [
		"of",
		"and",
		"for",
		"in",
		"not",
		"or",
		"if",
		"then",
		"parent",
		"list",
		"value"
	];
	var DEFAULT_KEYWORD_SCOPE = "keyword";
	/**
	* Given raw keywords from a language definition, compile them.
	*
	* @param {string | Record<string,string|string[]> | Array<string>} rawKeywords
	* @param {boolean} caseInsensitive
	*/
	function compileKeywords(rawKeywords, caseInsensitive, scopeName = DEFAULT_KEYWORD_SCOPE) {
		/** @type {import("highlight.js/private").KeywordDict} */
		const compiledKeywords = Object.create(null);
		if (typeof rawKeywords === "string") compileList(scopeName, rawKeywords.split(" "));
		else if (Array.isArray(rawKeywords)) compileList(scopeName, rawKeywords);
		else Object.keys(rawKeywords).forEach(function(scopeName) {
			Object.assign(compiledKeywords, compileKeywords(rawKeywords[scopeName], caseInsensitive, scopeName));
		});
		return compiledKeywords;
		/**
		* Compiles an individual list of keywords
		*
		* Ex: "for if when while|5"
		*
		* @param {string} scopeName
		* @param {Array<string>} keywordList
		*/
		function compileList(scopeName, keywordList) {
			if (caseInsensitive) keywordList = keywordList.map((x) => x.toLowerCase());
			keywordList.forEach(function(keyword) {
				const pair = keyword.split("|");
				compiledKeywords[pair[0]] = [scopeName, scoreForKeyword(pair[0], pair[1])];
			});
		}
	}
	/**
	* Returns the proper score for a given keyword
	*
	* Also takes into account comment keywords, which will be scored 0 UNLESS
	* another score has been manually assigned.
	* @param {string} keyword
	* @param {string} [providedScore]
	*/
	function scoreForKeyword(keyword, providedScore) {
		if (providedScore) return Number(providedScore);
		return commonKeyword(keyword) ? 0 : 1;
	}
	/**
	* Determines if a given keyword is common or not
	*
	* @param {string} keyword */
	function commonKeyword(keyword) {
		return COMMON_KEYWORDS.includes(keyword.toLowerCase());
	}
	/**
	* @type {Record<string, boolean>}
	*/
	var seenDeprecations = {};
	/**
	* @param {string} message
	*/
	var error = (message) => {
		console.error(message);
	};
	/**
	* @param {string} message
	* @param {any} args
	*/
	var warn = (message, ...args) => {
		console.log(`WARN: ${message}`, ...args);
	};
	/**
	* @param {string} version
	* @param {string} message
	*/
	var deprecated = (version, message) => {
		if (seenDeprecations[`${version}/${message}`]) return;
		console.log(`Deprecated as of ${version}. ${message}`);
		seenDeprecations[`${version}/${message}`] = true;
	};
	/**
	@typedef {import('highlight.js').CompiledMode} CompiledMode
	*/
	var MultiClassError = /* @__PURE__ */ new Error();
	/**
	* Renumbers labeled scope names to account for additional inner match
	* groups that otherwise would break everything.
	*
	* Lets say we 3 match scopes:
	*
	*   { 1 => ..., 2 => ..., 3 => ... }
	*
	* So what we need is a clean match like this:
	*
	*   (a)(b)(c) => [ "a", "b", "c" ]
	*
	* But this falls apart with inner match groups:
	*
	* (a)(((b)))(c) => ["a", "b", "b", "b", "c" ]
	*
	* Our scopes are now "out of alignment" and we're repeating `b` 3 times.
	* What needs to happen is the numbers are remapped:
	*
	*   { 1 => ..., 2 => ..., 5 => ... }
	*
	* We also need to know that the ONLY groups that should be output
	* are 1, 2, and 5.  This function handles this behavior.
	*
	* @param {CompiledMode} mode
	* @param {Array<RegExp | string>} regexes
	* @param {{key: "beginScope"|"endScope"}} opts
	*/
	function remapScopeNames(mode, regexes, { key }) {
		let offset = 0;
		const scopeNames = mode[key];
		/** @type Record<number,boolean> */
		const emit = {};
		/** @type Record<number,string> */
		const positions = {};
		for (let i = 1; i <= regexes.length; i++) {
			positions[i + offset] = scopeNames[i];
			emit[i + offset] = true;
			offset += countMatchGroups(regexes[i - 1]);
		}
		mode[key] = positions;
		mode[key]._emit = emit;
		mode[key]._multi = true;
	}
	/**
	* @param {CompiledMode} mode
	*/
	function beginMultiClass(mode) {
		if (!Array.isArray(mode.begin)) return;
		if (mode.skip || mode.excludeBegin || mode.returnBegin) {
			error("skip, excludeBegin, returnBegin not compatible with beginScope: {}");
			throw MultiClassError;
		}
		if (typeof mode.beginScope !== "object" || mode.beginScope === null) {
			error("beginScope must be object");
			throw MultiClassError;
		}
		remapScopeNames(mode, mode.begin, { key: "beginScope" });
		mode.begin = _rewriteBackreferences(mode.begin, { joinWith: "" });
	}
	/**
	* @param {CompiledMode} mode
	*/
	function endMultiClass(mode) {
		if (!Array.isArray(mode.end)) return;
		if (mode.skip || mode.excludeEnd || mode.returnEnd) {
			error("skip, excludeEnd, returnEnd not compatible with endScope: {}");
			throw MultiClassError;
		}
		if (typeof mode.endScope !== "object" || mode.endScope === null) {
			error("endScope must be object");
			throw MultiClassError;
		}
		remapScopeNames(mode, mode.end, { key: "endScope" });
		mode.end = _rewriteBackreferences(mode.end, { joinWith: "" });
	}
	/**
	* this exists only to allow `scope: {}` to be used beside `match:`
	* Otherwise `beginScope` would necessary and that would look weird
	
	{
	match: [ /def/, /\w+/ ]
	scope: { 1: "keyword" , 2: "title" }
	}
	
	* @param {CompiledMode} mode
	*/
	function scopeSugar(mode) {
		if (mode.scope && typeof mode.scope === "object" && mode.scope !== null) {
			mode.beginScope = mode.scope;
			delete mode.scope;
		}
	}
	/**
	* @param {CompiledMode} mode
	*/
	function MultiClass(mode) {
		scopeSugar(mode);
		if (typeof mode.beginScope === "string") mode.beginScope = { _wrap: mode.beginScope };
		if (typeof mode.endScope === "string") mode.endScope = { _wrap: mode.endScope };
		beginMultiClass(mode);
		endMultiClass(mode);
	}
	/**
	@typedef {import('highlight.js').Mode} Mode
	@typedef {import('highlight.js').CompiledMode} CompiledMode
	@typedef {import('highlight.js').Language} Language
	@typedef {import('highlight.js').HLJSPlugin} HLJSPlugin
	@typedef {import('highlight.js').CompiledLanguage} CompiledLanguage
	*/
	/**
	* Compiles a language definition result
	*
	* Given the raw result of a language definition (Language), compiles this so
	* that it is ready for highlighting code.
	* @param {Language} language
	* @returns {CompiledLanguage}
	*/
	function compileLanguage(language) {
		/**
		* Builds a regex with the case sensitivity of the current language
		*
		* @param {RegExp | string} value
		* @param {boolean} [global]
		*/
		function langRe(value, global) {
			return new RegExp(source(value), "m" + (language.case_insensitive ? "i" : "") + (language.unicodeRegex ? "u" : "") + (global ? "g" : ""));
		}
		/**
		Stores multiple regular expressions and allows you to quickly search for
		them all in a string simultaneously - returning the first match.  It does
		this by creating a huge (a|b|c) regex - each individual item wrapped with ()
		and joined by `|` - using match groups to track position.  When a match is
		found checking which position in the array has content allows us to figure
		out which of the original regexes / match groups triggered the match.
		
		The match object itself (the result of `Regex.exec`) is returned but also
		enhanced by merging in any meta-data that was registered with the regex.
		This is how we keep track of which mode matched, and what type of rule
		(`illegal`, `begin`, end, etc).
		*/
		class MultiRegex {
			constructor() {
				this.matchIndexes = {};
				this.regexes = [];
				this.matchAt = 1;
				this.position = 0;
			}
			addRule(re, opts) {
				opts.position = this.position++;
				this.matchIndexes[this.matchAt] = opts;
				this.regexes.push([opts, re]);
				this.matchAt += countMatchGroups(re) + 1;
			}
			compile() {
				if (this.regexes.length === 0) this.exec = () => null;
				const terminators = this.regexes.map((el) => el[1]);
				this.matcherRe = langRe(_rewriteBackreferences(terminators, { joinWith: "|" }), true);
				this.lastIndex = 0;
			}
			/** @param {string} s */
			exec(s) {
				this.matcherRe.lastIndex = this.lastIndex;
				const match = this.matcherRe.exec(s);
				if (!match) return null;
				const i = match.findIndex((el, i) => i > 0 && el !== void 0);
				const matchData = this.matchIndexes[i];
				match.splice(0, i);
				return Object.assign(match, matchData);
			}
		}
		class ResumableMultiRegex {
			constructor() {
				this.rules = [];
				this.multiRegexes = [];
				this.count = 0;
				this.lastIndex = 0;
				this.regexIndex = 0;
			}
			getMatcher(index) {
				if (this.multiRegexes[index]) return this.multiRegexes[index];
				const matcher = new MultiRegex();
				this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
				matcher.compile();
				this.multiRegexes[index] = matcher;
				return matcher;
			}
			resumingScanAtSamePosition() {
				return this.regexIndex !== 0;
			}
			considerAll() {
				this.regexIndex = 0;
			}
			addRule(re, opts) {
				this.rules.push([re, opts]);
				if (opts.type === "begin") this.count++;
			}
			/** @param {string} s */
			exec(s) {
				const m = this.getMatcher(this.regexIndex);
				m.lastIndex = this.lastIndex;
				let result = m.exec(s);
				if (this.resumingScanAtSamePosition()) {
					if (result && result.index === this.lastIndex);
					else {
						const m2 = this.getMatcher(0);
						m2.lastIndex = this.lastIndex + 1;
						result = m2.exec(s);
					}
				}
				if (result) {
					this.regexIndex += result.position + 1;
					if (this.regexIndex === this.count) this.considerAll();
				}
				return result;
			}
		}
		/**
		* Given a mode, builds a huge ResumableMultiRegex that can be used to walk
		* the content and find matches.
		*
		* @param {CompiledMode} mode
		* @returns {ResumableMultiRegex}
		*/
		function buildModeRegex(mode) {
			const mm = new ResumableMultiRegex();
			mode.contains.forEach((term) => mm.addRule(term.begin, {
				rule: term,
				type: "begin"
			}));
			if (mode.terminatorEnd) mm.addRule(mode.terminatorEnd, { type: "end" });
			if (mode.illegal) mm.addRule(mode.illegal, { type: "illegal" });
			return mm;
		}
		/** skip vs abort vs ignore
		*
		* @skip   - The mode is still entered and exited normally (and contains rules apply),
		*           but all content is held and added to the parent buffer rather than being
		*           output when the mode ends.  Mostly used with `sublanguage` to build up
		*           a single large buffer than can be parsed by sublanguage.
		*
		*             - The mode begin ands ends normally.
		*             - Content matched is added to the parent mode buffer.
		*             - The parser cursor is moved forward normally.
		*
		* @abort  - A hack placeholder until we have ignore.  Aborts the mode (as if it
		*           never matched) but DOES NOT continue to match subsequent `contains`
		*           modes.  Abort is bad/suboptimal because it can result in modes
		*           farther down not getting applied because an earlier rule eats the
		*           content but then aborts.
		*
		*             - The mode does not begin.
		*             - Content matched by `begin` is added to the mode buffer.
		*             - The parser cursor is moved forward accordingly.
		*
		* @ignore - Ignores the mode (as if it never matched) and continues to match any
		*           subsequent `contains` modes.  Ignore isn't technically possible with
		*           the current parser implementation.
		*
		*             - The mode does not begin.
		*             - Content matched by `begin` is ignored.
		*             - The parser cursor is not moved forward.
		*/
		/**
		* Compiles an individual mode
		*
		* This can raise an error if the mode contains certain detectable known logic
		* issues.
		* @param {Mode} mode
		* @param {CompiledMode | null} [parent]
		* @returns {CompiledMode | never}
		*/
		function compileMode(mode, parent) {
			const cmode = mode;
			if (mode.isCompiled) return cmode;
			[
				scopeClassName,
				compileMatch,
				MultiClass,
				beforeMatchExt
			].forEach((ext) => ext(mode, parent));
			language.compilerExtensions.forEach((ext) => ext(mode, parent));
			mode.__beforeBegin = null;
			[
				beginKeywords,
				compileIllegal,
				compileRelevance
			].forEach((ext) => ext(mode, parent));
			mode.isCompiled = true;
			let keywordPattern = null;
			if (typeof mode.keywords === "object" && mode.keywords.$pattern) {
				mode.keywords = Object.assign({}, mode.keywords);
				keywordPattern = mode.keywords.$pattern;
				delete mode.keywords.$pattern;
			}
			keywordPattern = keywordPattern || /\w+/;
			if (mode.keywords) mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
			cmode.keywordPatternRe = langRe(keywordPattern, true);
			if (parent) {
				if (!mode.begin) mode.begin = /\B|\b/;
				cmode.beginRe = langRe(cmode.begin);
				if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
				if (mode.end) cmode.endRe = langRe(cmode.end);
				cmode.terminatorEnd = source(cmode.end) || "";
				if (mode.endsWithParent && parent.terminatorEnd) cmode.terminatorEnd += (mode.end ? "|" : "") + parent.terminatorEnd;
			}
			if (mode.illegal) cmode.illegalRe = langRe(mode.illegal);
			if (!mode.contains) mode.contains = [];
			mode.contains = [].concat(...mode.contains.map(function(c) {
				return expandOrCloneMode(c === "self" ? mode : c);
			}));
			mode.contains.forEach(function(c) {
				compileMode(c, cmode);
			});
			if (mode.starts) compileMode(mode.starts, parent);
			cmode.matcher = buildModeRegex(cmode);
			return cmode;
		}
		if (!language.compilerExtensions) language.compilerExtensions = [];
		if (language.contains && language.contains.includes("self")) throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
		language.classNameAliases = inherit$1(language.classNameAliases || {});
		return compileMode(language);
	}
	/**
	* Determines if a mode has a dependency on it's parent or not
	*
	* If a mode does have a parent dependency then often we need to clone it if
	* it's used in multiple places so that each copy points to the correct parent,
	* where-as modes without a parent can often safely be re-used at the bottom of
	* a mode chain.
	*
	* @param {Mode | null} mode
	* @returns {boolean} - is there a dependency on the parent?
	* */
	function dependencyOnParent(mode) {
		if (!mode) return false;
		return mode.endsWithParent || dependencyOnParent(mode.starts);
	}
	/**
	* Expands a mode or clones it if necessary
	*
	* This is necessary for modes with parental dependenceis (see notes on
	* `dependencyOnParent`) and for nodes that have `variants` - which must then be
	* exploded into their own individual modes at compile time.
	*
	* @param {Mode} mode
	* @returns {Mode | Mode[]}
	* */
	function expandOrCloneMode(mode) {
		if (mode.variants && !mode.cachedVariants) mode.cachedVariants = mode.variants.map(function(variant) {
			return inherit$1(mode, { variants: null }, variant);
		});
		if (mode.cachedVariants) return mode.cachedVariants;
		if (dependencyOnParent(mode)) return inherit$1(mode, { starts: mode.starts ? inherit$1(mode.starts) : null });
		if (Object.isFrozen(mode)) return inherit$1(mode);
		return mode;
	}
	var version = "11.12.0";
	var HTMLInjectionError = class extends Error {
		constructor(reason, html) {
			super(reason);
			this.name = "HTMLInjectionError";
			this.html = html;
		}
	};
	/**
	@typedef {import('highlight.js').Mode} Mode
	@typedef {import('highlight.js').CompiledMode} CompiledMode
	@typedef {import('highlight.js').CompiledScope} CompiledScope
	@typedef {import('highlight.js').Language} Language
	@typedef {import('highlight.js').HLJSApi} HLJSApi
	@typedef {import('highlight.js').HLJSPlugin} HLJSPlugin
	@typedef {import('highlight.js').PluginEvent} PluginEvent
	@typedef {import('highlight.js').HLJSOptions} HLJSOptions
	@typedef {import('highlight.js').LanguageFn} LanguageFn
	@typedef {import('highlight.js').HighlightedHTMLElement} HighlightedHTMLElement
	@typedef {import('highlight.js').BeforeHighlightContext} BeforeHighlightContext
	@typedef {import('highlight.js/private').MatchType} MatchType
	@typedef {import('highlight.js/private').KeywordData} KeywordData
	@typedef {import('highlight.js/private').EnhancedMatch} EnhancedMatch
	@typedef {import('highlight.js/private').AnnotatedError} AnnotatedError
	@typedef {import('highlight.js').AutoHighlightResult} AutoHighlightResult
	@typedef {import('highlight.js').HighlightOptions} HighlightOptions
	@typedef {import('highlight.js').HighlightResult} HighlightResult
	*/
	var escape = escapeHTML;
	var inherit = inherit$1;
	var NO_MATCH = Symbol("nomatch");
	var MAX_KEYWORD_HITS = 7;
	/**
	* @param {any} hljs - object that is extended (legacy)
	* @returns {HLJSApi}
	*/
	var HLJS = function(hljs) {
		/** @type {Record<string, Language>} */
		const languages = Object.create(null);
		/** @type {Record<string, string>} */
		const aliases = Object.create(null);
		/** @type {HLJSPlugin[]} */
		const plugins = [];
		let SAFE_MODE = true;
		const LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
		/** @type {Language} */
		const PLAINTEXT_LANGUAGE = {
			disableAutodetect: true,
			name: "Plain text",
			contains: []
		};
		/** @type HLJSOptions */
		let options = {
			ignoreUnescapedHTML: false,
			throwUnescapedHTML: false,
			noHighlightRe: /^(no-?highlight)$/i,
			languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
			classPrefix: "hljs-",
			cssSelector: "pre code",
			languages: null,
			__emitter: TokenTreeEmitter
		};
		/**
		* Tests a language name to see if highlighting should be skipped
		* @param {string} languageName
		*/
		function shouldNotHighlight(languageName) {
			return options.noHighlightRe.test(languageName);
		}
		/**
		* @param {HighlightedHTMLElement} block - the HTML element to determine language for
		*/
		function blockLanguage(block) {
			let classes = block.className + " ";
			classes += block.parentNode ? block.parentNode.className : "";
			const match = options.languageDetectRe.exec(classes);
			if (match) {
				const language = getLanguage(match[1]);
				if (!language) {
					warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
					warn("Falling back to no-highlight mode for this block.", block);
				}
				return language ? match[1] : "no-highlight";
			}
			return classes.split(/\s+/).find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
		}
		/**
		* Core highlighting function.
		*
		* OLD API
		* highlight(lang, code, ignoreIllegals, continuation)
		*
		* NEW API
		* highlight(code, {lang, ignoreIllegals})
		*
		* @param {string} codeOrLanguageName - the language to use for highlighting
		* @param {string | HighlightOptions} optionsOrCode - the code to highlight
		* @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
		*
		* @returns {HighlightResult} Result - an object that represents the result
		* @property {string} language - the language name
		* @property {number} relevance - the relevance score
		* @property {string} value - the highlighted HTML code
		* @property {string} code - the original raw code
		* @property {CompiledMode} top - top of the current mode stack
		* @property {boolean} illegal - indicates whether any illegal matches were found
		*/
		function highlight(codeOrLanguageName, optionsOrCode, ignoreIllegals) {
			let code = "";
			let languageName = "";
			if (typeof optionsOrCode === "object") {
				code = codeOrLanguageName;
				ignoreIllegals = optionsOrCode.ignoreIllegals;
				languageName = optionsOrCode.language;
			} else {
				deprecated("10.7.0", "highlight(lang, code, ...args) has been deprecated.");
				deprecated("10.7.0", "Please use highlight(code, options) instead.\nhttps://github.com/highlightjs/highlight.js/issues/2277");
				languageName = codeOrLanguageName;
				code = optionsOrCode;
			}
			if (ignoreIllegals === void 0) ignoreIllegals = true;
			/** @type {BeforeHighlightContext} */
			const context = {
				code,
				language: languageName
			};
			fire("before:highlight", context);
			const result = context.result ? context.result : _highlight(context.language, context.code, ignoreIllegals);
			result.code = context.code;
			fire("after:highlight", result);
			return result;
		}
		/**
		* private highlight that's used internally and does not fire callbacks
		*
		* @param {string} languageName - the language to use for highlighting
		* @param {string} codeToHighlight - the code to highlight
		* @param {boolean?} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
		* @param {CompiledMode?} [continuation] - current continuation mode, if any
		* @returns {HighlightResult} - result of the highlight operation
		*/
		function _highlight(languageName, codeToHighlight, ignoreIllegals, continuation) {
			const keywordHits = Object.create(null);
			/**
			* Return keyword data if a match is a keyword
			* @param {CompiledMode} mode - current mode
			* @param {string} matchText - the textual match
			* @returns {KeywordData | false}
			*/
			function keywordData(mode, matchText) {
				return mode.keywords[matchText];
			}
			function processKeywords() {
				if (!top.keywords) {
					emitter.addText(modeBuffer);
					return;
				}
				let lastIndex = 0;
				top.keywordPatternRe.lastIndex = 0;
				let match = top.keywordPatternRe.exec(modeBuffer);
				let buf = "";
				while (match) {
					buf += modeBuffer.substring(lastIndex, match.index);
					const word = language.case_insensitive ? match[0].toLowerCase() : match[0];
					const data = keywordData(top, word);
					if (data) {
						const [kind, keywordRelevance] = data;
						emitter.addText(buf);
						buf = "";
						keywordHits[word] = (keywordHits[word] || 0) + 1;
						if (keywordHits[word] <= MAX_KEYWORD_HITS) relevance += keywordRelevance;
						if (kind.startsWith("_")) buf += match[0];
						else {
							const cssClass = language.classNameAliases[kind] || kind;
							emitKeyword(match[0], cssClass);
						}
					} else buf += match[0];
					lastIndex = top.keywordPatternRe.lastIndex;
					match = top.keywordPatternRe.exec(modeBuffer);
				}
				buf += modeBuffer.substring(lastIndex);
				emitter.addText(buf);
			}
			function processSubLanguage() {
				if (modeBuffer === "") return;
				/** @type HighlightResult */
				let result = null;
				if (typeof top.subLanguage === "string") {
					if (!languages[top.subLanguage]) {
						emitter.addText(modeBuffer);
						return;
					}
					result = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
					continuations[top.subLanguage] = result._top;
				} else result = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
				if (top.relevance > 0) relevance += result.relevance;
				emitter.__addSublanguage(result._emitter, result.language);
			}
			function processBuffer() {
				if (top.subLanguage != null) processSubLanguage();
				else processKeywords();
				modeBuffer = "";
			}
			/**
			* @param {string} text
			* @param {string} scope
			*/
			function emitKeyword(keyword, scope) {
				if (keyword === "") return;
				emitter.startScope(scope);
				emitter.addText(keyword);
				emitter.endScope();
			}
			/**
			* @param {CompiledScope} scope
			* @param {RegExpMatchArray} match
			*/
			function emitMultiClass(scope, match) {
				let i = 1;
				const max = match.length - 1;
				while (i <= max) {
					if (!scope._emit[i]) {
						i++;
						continue;
					}
					const klass = language.classNameAliases[scope[i]] || scope[i];
					const text = match[i];
					if (klass) emitKeyword(text, klass);
					else {
						modeBuffer = text;
						processKeywords();
						modeBuffer = "";
					}
					i++;
				}
			}
			/**
			* @param {CompiledMode} mode - new mode to start
			* @param {RegExpMatchArray} match
			*/
			function startNewMode(mode, match) {
				if (mode.scope && typeof mode.scope === "string") emitter.openNode(language.classNameAliases[mode.scope] || mode.scope);
				if (mode.beginScope) {
					if (mode.beginScope._wrap) {
						emitKeyword(modeBuffer, language.classNameAliases[mode.beginScope._wrap] || mode.beginScope._wrap);
						modeBuffer = "";
					} else if (mode.beginScope._multi) {
						emitMultiClass(mode.beginScope, match);
						modeBuffer = "";
					}
				}
				top = Object.create(mode, { parent: { value: top } });
				return top;
			}
			/**
			* @param {CompiledMode } mode - the mode to potentially end
			* @param {RegExpMatchArray} match - the latest match
			* @param {string} matchPlusRemainder - match plus remainder of content
			* @returns {CompiledMode | void} - the next mode, or if void continue on in current mode
			*/
			function endOfMode(mode, match, matchPlusRemainder) {
				let matched = startsWith(mode.endRe, matchPlusRemainder);
				if (matched) {
					if (mode["on:end"]) {
						const resp = new Response(mode);
						mode["on:end"](match, resp);
						if (resp.isMatchIgnored) matched = false;
					}
					if (matched) {
						while (mode.endsParent && mode.parent) mode = mode.parent;
						return mode;
					}
				}
				if (mode.endsWithParent) return endOfMode(mode.parent, match, matchPlusRemainder);
			}
			/**
			* Handle matching but then ignoring a sequence of text
			*
			* @param {string} lexeme - string containing full match text
			*/
			function doIgnore(lexeme) {
				if (top.matcher.regexIndex === 0) {
					modeBuffer += lexeme[0];
					return 1;
				} else {
					resumeScanAtSamePosition = true;
					return 0;
				}
			}
			/**
			* Handle the start of a new potential mode match
			*
			* @param {EnhancedMatch} match - the current match
			* @returns {number} how far to advance the parse cursor
			*/
			function doBeginMatch(match) {
				const lexeme = match[0];
				const newMode = match.rule;
				const resp = new Response(newMode);
				const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
				for (const cb of beforeCallbacks) {
					if (!cb) continue;
					cb(match, resp);
					if (resp.isMatchIgnored) return doIgnore(lexeme);
				}
				if (newMode.skip) modeBuffer += lexeme;
				else {
					if (newMode.excludeBegin) modeBuffer += lexeme;
					processBuffer();
					if (!newMode.returnBegin && !newMode.excludeBegin) modeBuffer = lexeme;
				}
				startNewMode(newMode, match);
				return newMode.returnBegin ? 0 : lexeme.length;
			}
			/**
			* Handle the potential end of mode
			*
			* @param {RegExpMatchArray} match - the current match
			*/
			function doEndMatch(match) {
				const lexeme = match[0];
				const matchPlusRemainder = codeToHighlight.substring(match.index);
				const endMode = endOfMode(top, match, matchPlusRemainder);
				if (!endMode) return NO_MATCH;
				const origin = top;
				if (top.endScope && top.endScope._wrap) {
					processBuffer();
					emitKeyword(lexeme, top.endScope._wrap);
				} else if (top.endScope && top.endScope._multi) {
					processBuffer();
					emitMultiClass(top.endScope, match);
				} else if (origin.skip) modeBuffer += lexeme;
				else {
					if (!(origin.returnEnd || origin.excludeEnd)) modeBuffer += lexeme;
					processBuffer();
					if (origin.excludeEnd) modeBuffer = lexeme;
				}
				do {
					if (top.scope) emitter.closeNode();
					if (!top.skip && !top.subLanguage) relevance += top.relevance;
					top = top.parent;
				} while (top !== endMode.parent);
				if (endMode.starts) startNewMode(endMode.starts, match);
				return origin.returnEnd ? 0 : lexeme.length;
			}
			function processContinuations() {
				const list = [];
				for (let current = top; current !== language; current = current.parent) if (current.scope) list.unshift(current.scope);
				list.forEach((item) => emitter.openNode(item));
			}
			/** @type {{type?: MatchType, index?: number, rule?: Mode}}} */
			let lastMatch = {};
			/**
			*  Process an individual match
			*
			* @param {string} textBeforeMatch - text preceding the match (since the last match)
			* @param {EnhancedMatch} [match] - the match itself
			*/
			function processLexeme(textBeforeMatch, match) {
				const lexeme = match && match[0];
				modeBuffer += textBeforeMatch;
				if (lexeme == null) {
					processBuffer();
					return 0;
				}
				if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
					modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
					if (!SAFE_MODE) {
						/** @type {AnnotatedError} */
						const err = /* @__PURE__ */ new Error(`0 width match regex (${languageName})`);
						err.languageName = languageName;
						err.badRule = lastMatch.rule;
						throw err;
					}
					return 1;
				}
				lastMatch = match;
				if (match.type === "begin") return doBeginMatch(match);
				else if (match.type === "illegal" && !ignoreIllegals) {
					/** @type {AnnotatedError} */
					const err = /* @__PURE__ */ new Error("Illegal lexeme \"" + lexeme + "\" for mode \"" + (top.scope || "<unnamed>") + "\"");
					err.mode = top;
					throw err;
				} else if (match.type === "end") {
					const processed = doEndMatch(match);
					if (processed !== NO_MATCH) return processed;
				}
				if (match.type === "illegal" && lexeme === "") {
					if (match.index === codeToHighlight.length);
					else modeBuffer += "\n";
					return 1;
				}
				if (iterations > 1e5 && iterations > match.index * 3) throw /* @__PURE__ */ new Error("potential infinite loop, way more iterations than matches");
				modeBuffer += lexeme;
				return lexeme.length;
			}
			const language = getLanguage(languageName);
			if (!language) {
				error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
				throw new Error("Unknown language: \"" + languageName + "\"");
			}
			const md = compileLanguage(language);
			let result = "";
			/** @type {CompiledMode} */
			let top = continuation || md;
			/** @type Record<string,CompiledMode> */
			const continuations = {};
			const emitter = new options.__emitter(options);
			processContinuations();
			let modeBuffer = "";
			let relevance = 0;
			let index = 0;
			let iterations = 0;
			let resumeScanAtSamePosition = false;
			try {
				if (!language.__emitTokens) {
					top.matcher.considerAll();
					for (;;) {
						iterations++;
						if (resumeScanAtSamePosition) resumeScanAtSamePosition = false;
						else top.matcher.considerAll();
						top.matcher.lastIndex = index;
						const match = top.matcher.exec(codeToHighlight);
						if (!match) break;
						const processedCount = processLexeme(codeToHighlight.substring(index, match.index), match);
						index = match.index + processedCount;
					}
					processLexeme(codeToHighlight.substring(index));
				} else language.__emitTokens(codeToHighlight, emitter);
				emitter.finalize();
				result = emitter.toHTML();
				return {
					language: languageName,
					value: result,
					relevance,
					illegal: false,
					_emitter: emitter,
					_top: top
				};
			} catch (err) {
				if (err.message && err.message.includes("Illegal")) return {
					language: languageName,
					value: escape(codeToHighlight),
					illegal: true,
					relevance: 0,
					_illegalBy: {
						message: err.message,
						index,
						context: codeToHighlight.slice(index - 100, index + 100),
						mode: err.mode,
						resultSoFar: result
					},
					_emitter: emitter
				};
				else if (SAFE_MODE) return {
					language: languageName,
					value: escape(codeToHighlight),
					illegal: false,
					relevance: 0,
					errorRaised: err,
					_emitter: emitter,
					_top: top
				};
				else throw err;
			}
		}
		/**
		* returns a valid highlight result, without actually doing any actual work,
		* auto highlight starts with this and it's possible for small snippets that
		* auto-detection may not find a better match
		* @param {string} code
		* @returns {HighlightResult}
		*/
		function justTextHighlightResult(code) {
			const result = {
				value: escape(code),
				illegal: false,
				relevance: 0,
				_top: PLAINTEXT_LANGUAGE,
				_emitter: new options.__emitter(options)
			};
			result._emitter.addText(code);
			return result;
		}
		/**
		Highlighting with language detection. Accepts a string with the code to
		highlight. Returns an object with the following properties:
		
		- language (detected language)
		- relevance (int)
		- value (an HTML string with highlighting markup)
		- secondBest (object with the same structure for second-best heuristically
		detected language, may be absent)
		
		@param {string} code
		@param {Array<string>} [languageSubset]
		@returns {AutoHighlightResult}
		*/
		function highlightAuto(code, languageSubset) {
			languageSubset = languageSubset || options.languages || Object.keys(languages);
			const plaintext = justTextHighlightResult(code);
			const results = languageSubset.filter(getLanguage).filter(autoDetection).map((name) => _highlight(name, code, false));
			results.unshift(plaintext);
			const [best, secondBest] = results.sort((a, b) => {
				if (a.relevance !== b.relevance) return b.relevance - a.relevance;
				if (a.language && b.language) {
					if (getLanguage(a.language).supersetOf === b.language) return 1;
					else if (getLanguage(b.language).supersetOf === a.language) return -1;
				}
				return 0;
			});
			/** @type {AutoHighlightResult} */
			const result = best;
			result.secondBest = secondBest;
			return result;
		}
		/**
		* Builds new class name for block given the language name
		*
		* @param {HTMLElement} element
		* @param {string} [currentLang]
		* @param {string} [resultLang]
		*/
		function updateClassName(element, currentLang, resultLang) {
			const language = currentLang && aliases[currentLang] || resultLang;
			element.classList.add("hljs");
			element.classList.add(`language-${language}`);
		}
		/**
		* Applies highlighting to a DOM node containing code.
		*
		* @param {HighlightedHTMLElement} element - the HTML element to highlight
		*/
		function highlightElement(element) {
			/** @type HTMLElement */
			let node = null;
			const language = blockLanguage(element);
			if (shouldNotHighlight(language)) return;
			fire("before:highlightElement", {
				el: element,
				language
			});
			if (element.dataset.highlighted) {
				console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.", element);
				return;
			}
			if (element.children.length > 0) {
				if (!options.ignoreUnescapedHTML) {
					console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk.");
					console.warn("https://github.com/highlightjs/highlight.js/wiki/security");
					console.warn("The element with unescaped HTML:");
					console.warn(element);
				}
				if (options.throwUnescapedHTML) throw new HTMLInjectionError("One of your code blocks includes unescaped HTML.", element.innerHTML);
			}
			node = element;
			const text = node.textContent;
			const result = language ? highlight(text, {
				language,
				ignoreIllegals: true
			}) : highlightAuto(text);
			element.innerHTML = result.value;
			element.dataset.highlighted = "yes";
			updateClassName(element, language, result.language);
			element.result = {
				language: result.language,
				re: result.relevance,
				relevance: result.relevance
			};
			if (result.secondBest) element.secondBest = {
				language: result.secondBest.language,
				relevance: result.secondBest.relevance
			};
			fire("after:highlightElement", {
				el: element,
				result,
				text
			});
		}
		/**
		* Updates highlight.js global options with the passed options
		*
		* @param {Partial<HLJSOptions>} userOptions
		*/
		function configure(userOptions) {
			options = inherit(options, userOptions);
		}
		const initHighlighting = () => {
			highlightAll();
			deprecated("10.6.0", "initHighlighting() deprecated.  Use highlightAll() now.");
		};
		function initHighlightingOnLoad() {
			highlightAll();
			deprecated("10.6.0", "initHighlightingOnLoad() deprecated.  Use highlightAll() now.");
		}
		let wantsHighlight = false;
		/**
		* auto-highlights all pre>code elements on the page
		*/
		function highlightAll() {
			function boot() {
				highlightAll();
			}
			if (document.readyState === "loading") {
				if (!wantsHighlight) window.addEventListener("DOMContentLoaded", boot, false);
				wantsHighlight = true;
				return;
			}
			document.querySelectorAll(options.cssSelector).forEach(highlightElement);
		}
		/**
		* Register a language grammar module
		*
		* @param {string} languageName
		* @param {LanguageFn} languageDefinition
		*/
		function registerLanguage(languageName, languageDefinition) {
			let lang = null;
			try {
				lang = languageDefinition(hljs);
			} catch (error$1) {
				error("Language definition for '{}' could not be registered.".replace("{}", languageName));
				if (!SAFE_MODE) throw error$1;
				else error(error$1);
				lang = PLAINTEXT_LANGUAGE;
			}
			if (!lang.name) lang.name = languageName;
			languages[languageName] = lang;
			lang.rawDefinition = languageDefinition.bind(null, hljs);
			if (lang.aliases) registerAliases(lang.aliases, { languageName });
		}
		/**
		* Remove a language grammar module
		*
		* @param {string} languageName
		*/
		function unregisterLanguage(languageName) {
			delete languages[languageName];
			for (const alias of Object.keys(aliases)) if (aliases[alias] === languageName) delete aliases[alias];
		}
		/**
		* @returns {string[]} List of language internal names
		*/
		function listLanguages() {
			return Object.keys(languages);
		}
		/**
		* @param {string} name - name of the language to retrieve
		* @returns {Language | undefined}
		*/
		function getLanguage(name) {
			name = (name || "").toLowerCase();
			return languages[name] || languages[aliases[name]];
		}
		/**
		*
		* @param {string|string[]} aliasList - single alias or list of aliases
		* @param {{languageName: string}} opts
		*/
		function registerAliases(aliasList, { languageName }) {
			if (typeof aliasList === "string") aliasList = [aliasList];
			aliasList.forEach((alias) => {
				aliases[alias.toLowerCase()] = languageName;
			});
		}
		/**
		* Determines if a given language has auto-detection enabled
		* @param {string} name - name of the language
		*/
		function autoDetection(name) {
			const lang = getLanguage(name);
			return lang && !lang.disableAutodetect;
		}
		/**
		* Upgrades the old highlightBlock plugins to the new
		* highlightElement API
		* @param {HLJSPlugin} plugin
		*/
		function upgradePluginAPI(plugin) {
			if (plugin["before:highlightBlock"] && !plugin["before:highlightElement"]) plugin["before:highlightElement"] = (data) => {
				plugin["before:highlightBlock"](Object.assign({ block: data.el }, data));
			};
			if (plugin["after:highlightBlock"] && !plugin["after:highlightElement"]) plugin["after:highlightElement"] = (data) => {
				plugin["after:highlightBlock"](Object.assign({ block: data.el }, data));
			};
		}
		/**
		* @param {HLJSPlugin} plugin
		*/
		function addPlugin(plugin) {
			upgradePluginAPI(plugin);
			plugins.push(plugin);
		}
		/**
		* @param {HLJSPlugin} plugin
		*/
		function removePlugin(plugin) {
			const index = plugins.indexOf(plugin);
			if (index !== -1) plugins.splice(index, 1);
		}
		/**
		*
		* @param {PluginEvent} event
		* @param {any} args
		*/
		function fire(event, args) {
			const cb = event;
			plugins.forEach(function(plugin) {
				if (plugin[cb]) plugin[cb](args);
			});
		}
		/**
		* DEPRECATED
		* @param {HighlightedHTMLElement} el
		*/
		function deprecateHighlightBlock(el) {
			deprecated("10.7.0", "highlightBlock will be removed entirely in v12.0");
			deprecated("10.7.0", "Please use highlightElement now.");
			return highlightElement(el);
		}
		Object.assign(hljs, {
			highlight,
			highlightAuto,
			highlightAll,
			highlightElement,
			highlightBlock: deprecateHighlightBlock,
			configure,
			initHighlighting,
			initHighlightingOnLoad,
			registerLanguage,
			unregisterLanguage,
			listLanguages,
			getLanguage,
			registerAliases,
			autoDetection,
			inherit,
			addPlugin,
			removePlugin
		});
		hljs.debugMode = function() {
			SAFE_MODE = false;
		};
		hljs.safeMode = function() {
			SAFE_MODE = true;
		};
		hljs.versionString = version;
		hljs.regex = {
			concat,
			lookahead,
			either,
			optional,
			anyNumberOfTimes
		};
		for (const key in MODES) if (typeof MODES[key] === "object") deepFreeze(MODES[key]);
		Object.assign(hljs, MODES);
		return hljs;
	};
	var highlight = HLJS({});
	highlight.newInstance = () => HLJS({});
	module.exports = highlight;
	highlight.HighlightJS = highlight;
	highlight.default = highlight;
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/core.js
var import_core, core_default;
var init_core = __esmMin((() => {
	import_core = /* @__PURE__ */ __toESM(require_core());
	core_default = import_core.default;
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/bash.js
/** @type LanguageFn */
function bash(hljs) {
	const regex = hljs.regex;
	const VAR = {};
	const BRACED_VAR = {
		begin: /\$\{/,
		end: /\}/,
		contains: ["self", {
			begin: /:-/,
			contains: [VAR]
		}]
	};
	Object.assign(VAR, {
		className: "variable",
		variants: [{ begin: regex.concat(/\$[\w\d#@][\w\d_]*/, `(?![\\w\\d])(?![$])`) }, BRACED_VAR]
	});
	const SUBST = {
		className: "subst",
		begin: /\$\(/,
		end: /\)/,
		contains: [hljs.BACKSLASH_ESCAPE]
	};
	const COMMENT = hljs.inherit(hljs.COMMENT(), {
		match: [/(^|\s)/, /#.*$/],
		scope: { 2: "comment" }
	});
	const HERE_DOC = {
		begin: /<<-?\s*(?=\w+)/,
		starts: { contains: [hljs.END_SAME_AS_BEGIN({
			begin: /(\w+)/,
			end: /(\w+)/,
			className: "string"
		})] }
	};
	const QUOTE_STRING = {
		className: "string",
		begin: /"/,
		end: /"/,
		contains: [
			hljs.BACKSLASH_ESCAPE,
			VAR,
			SUBST
		]
	};
	SUBST.contains.push(QUOTE_STRING);
	const ESCAPED_QUOTE = { match: /\\"/ };
	const APOS_STRING = {
		className: "string",
		begin: /'/,
		end: /'/
	};
	const ESCAPED_APOS = { match: /\\'/ };
	const ARITHMETIC = {
		begin: /\$?\(\(/,
		end: /\)\)/,
		contains: [
			{
				begin: /\d+#[0-9a-f]+/,
				className: "number"
			},
			hljs.NUMBER_MODE,
			VAR
		]
	};
	const KNOWN_SHEBANG = hljs.SHEBANG({
		binary: `(${[
			"fish",
			"bash",
			"zsh",
			"sh",
			"csh",
			"ksh",
			"tcsh",
			"dash",
			"scsh"
		].join("|")})`,
		relevance: 10
	});
	const FUNCTION = {
		className: "function",
		begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
		returnBegin: true,
		contains: [hljs.inherit(hljs.TITLE_MODE, { begin: /\w[\w\d_]*/ })],
		relevance: 0
	};
	const KEYWORDS = [
		"if",
		"then",
		"else",
		"elif",
		"fi",
		"time",
		"for",
		"while",
		"until",
		"in",
		"do",
		"done",
		"case",
		"esac",
		"coproc",
		"function",
		"select"
	];
	const LITERALS = ["true", "false"];
	const PATH_MODE = { match: /(\/[a-z._-]+)+/ };
	const SHELL_BUILT_INS = [
		"break",
		"cd",
		"continue",
		"eval",
		"exec",
		"exit",
		"export",
		"getopts",
		"hash",
		"pwd",
		"readonly",
		"return",
		"shift",
		"test",
		"times",
		"trap",
		"umask",
		"unset"
	];
	const BASH_BUILT_INS = [
		"alias",
		"bind",
		"builtin",
		"caller",
		"command",
		"declare",
		"echo",
		"enable",
		"help",
		"let",
		"local",
		"logout",
		"mapfile",
		"printf",
		"read",
		"readarray",
		"source",
		"sudo",
		"type",
		"typeset",
		"ulimit",
		"unalias"
	];
	const ZSH_BUILT_INS = [
		"autoload",
		"bg",
		"bindkey",
		"bye",
		"cap",
		"chdir",
		"clone",
		"comparguments",
		"compcall",
		"compctl",
		"compdescribe",
		"compfiles",
		"compgroups",
		"compquote",
		"comptags",
		"comptry",
		"compvalues",
		"dirs",
		"disable",
		"disown",
		"echotc",
		"echoti",
		"emulate",
		"fc",
		"fg",
		"float",
		"functions",
		"getcap",
		"getln",
		"history",
		"integer",
		"jobs",
		"kill",
		"limit",
		"log",
		"noglob",
		"popd",
		"print",
		"pushd",
		"pushln",
		"rehash",
		"sched",
		"setcap",
		"setopt",
		"stat",
		"suspend",
		"ttyctl",
		"unfunction",
		"unhash",
		"unlimit",
		"unsetopt",
		"vared",
		"wait",
		"whence",
		"where",
		"which",
		"zcompile",
		"zformat",
		"zftp",
		"zle",
		"zmodload",
		"zparseopts",
		"zprof",
		"zpty",
		"zregexparse",
		"zsocket",
		"zstyle",
		"ztcp"
	];
	const GNU_CORE_UTILS = [
		"chcon",
		"chgrp",
		"chown",
		"chmod",
		"cp",
		"dd",
		"df",
		"dir",
		"dircolors",
		"ln",
		"ls",
		"mkdir",
		"mkfifo",
		"mknod",
		"mktemp",
		"mv",
		"realpath",
		"rm",
		"rmdir",
		"shred",
		"sync",
		"touch",
		"truncate",
		"vdir",
		"b2sum",
		"base32",
		"base64",
		"cat",
		"cksum",
		"comm",
		"csplit",
		"cut",
		"expand",
		"fmt",
		"fold",
		"head",
		"join",
		"md5sum",
		"nl",
		"numfmt",
		"od",
		"paste",
		"ptx",
		"pr",
		"sha1sum",
		"sha224sum",
		"sha256sum",
		"sha384sum",
		"sha512sum",
		"shuf",
		"sort",
		"split",
		"sum",
		"tac",
		"tail",
		"tr",
		"tsort",
		"unexpand",
		"uniq",
		"wc",
		"arch",
		"basename",
		"chroot",
		"date",
		"dirname",
		"du",
		"echo",
		"env",
		"expr",
		"factor",
		"groups",
		"hostid",
		"id",
		"link",
		"logname",
		"nice",
		"nohup",
		"nproc",
		"pathchk",
		"pinky",
		"printenv",
		"printf",
		"pwd",
		"readlink",
		"runcon",
		"seq",
		"sleep",
		"stat",
		"stdbuf",
		"stty",
		"tee",
		"test",
		"timeout",
		"tty",
		"uname",
		"unlink",
		"uptime",
		"users",
		"who",
		"whoami",
		"yes"
	];
	return {
		name: "Bash",
		aliases: ["sh", "zsh"],
		keywords: {
			$pattern: /\b[a-z][a-z0-9._-]+\b/,
			keyword: KEYWORDS,
			literal: LITERALS,
			built_in: [
				...SHELL_BUILT_INS,
				...BASH_BUILT_INS,
				"set",
				"shopt",
				...ZSH_BUILT_INS,
				...GNU_CORE_UTILS
			]
		},
		contains: [
			KNOWN_SHEBANG,
			hljs.SHEBANG(),
			FUNCTION,
			ARITHMETIC,
			COMMENT,
			HERE_DOC,
			PATH_MODE,
			QUOTE_STRING,
			ESCAPED_QUOTE,
			APOS_STRING,
			ESCAPED_APOS,
			VAR
		]
	};
}
var init_bash = __esmMin((() => {}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/css.js
/** @type LanguageFn */
function css(hljs) {
	const regex = hljs.regex;
	const modes = MODES(hljs);
	const VENDOR_PREFIX = { begin: /-(webkit|moz|ms|o)-(?=[a-z])/ };
	const AT_MODIFIERS = "and or not only";
	const AT_PROPERTY_RE = /@-?\w[\w]*(-\w+)*/;
	const STRINGS = [hljs.APOS_STRING_MODE, hljs.QUOTE_STRING_MODE];
	return {
		name: "CSS",
		case_insensitive: true,
		illegal: /[=|'\$]/,
		keywords: { keyframePosition: "from to" },
		classNameAliases: { keyframePosition: "selector-tag" },
		contains: [
			modes.BLOCK_COMMENT,
			VENDOR_PREFIX,
			modes.CSS_NUMBER_MODE,
			{
				className: "selector-id",
				begin: /#[A-Za-z0-9_-]+/,
				relevance: 0
			},
			{
				className: "selector-class",
				begin: "\\.[a-zA-Z-][a-zA-Z0-9_-]*",
				relevance: 0
			},
			modes.ATTRIBUTE_SELECTOR_MODE,
			{
				className: "selector-pseudo",
				variants: [{ begin: ":(" + PSEUDO_CLASSES.join("|") + ")" }, { begin: ":(:)?(" + PSEUDO_ELEMENTS.join("|") + ")" }]
			},
			modes.CSS_VARIABLE,
			{
				className: "attribute",
				begin: "\\b(" + ATTRIBUTES.join("|") + ")\\b"
			},
			{
				begin: /:/,
				end: /[;}{]/,
				contains: [
					modes.BLOCK_COMMENT,
					modes.HEXCOLOR,
					modes.IMPORTANT,
					modes.CSS_NUMBER_MODE,
					modes.UNICODE_RANGE,
					...STRINGS,
					{
						begin: /(url|data-uri)\(/,
						end: /\)/,
						relevance: 0,
						keywords: { built_in: "url data-uri" },
						contains: [...STRINGS, {
							className: "string",
							begin: /[^)]/,
							endsWithParent: true,
							excludeEnd: true
						}]
					},
					modes.FUNCTION_DISPATCH
				]
			},
			{
				begin: regex.lookahead(/@/),
				end: "[{;]",
				relevance: 0,
				illegal: /:/,
				contains: [{
					className: "keyword",
					begin: AT_PROPERTY_RE
				}, {
					begin: /\s/,
					endsWithParent: true,
					excludeEnd: true,
					relevance: 0,
					keywords: {
						$pattern: /[a-z-]+/,
						keyword: AT_MODIFIERS,
						attribute: MEDIA_FEATURES.join(" ")
					},
					contains: [
						{
							begin: /[a-z-]+(?=:)/,
							className: "attribute"
						},
						...STRINGS,
						modes.CSS_NUMBER_MODE
					]
				}]
			},
			{
				className: "selector-tag",
				begin: "\\b(" + TAGS.join("|") + ")\\b"
			}
		]
	};
}
var MODES, HTML_TAGS, SVG_TAGS, TAGS, MEDIA_FEATURES, PSEUDO_CLASSES, PSEUDO_ELEMENTS, ATTRIBUTES;
var init_css = __esmMin((() => {
	MODES = (hljs) => {
		return {
			IMPORTANT: {
				scope: "meta",
				begin: "!important"
			},
			BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
			HEXCOLOR: {
				scope: "number",
				begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
			},
			UNICODE_RANGE: {
				scope: "number",
				begin: /\b[Uu]\+[0-9A-Fa-f][0-9A-Fa-f?]{0,5}(-[0-9A-Fa-f][0-9A-Fa-f]{0,5})?/
			},
			FUNCTION_DISPATCH: {
				className: "built_in",
				begin: /[\w-]+(?=\()/
			},
			ATTRIBUTE_SELECTOR_MODE: {
				scope: "selector-attr",
				begin: /\[/,
				end: /\]/,
				illegal: "$",
				contains: [hljs.APOS_STRING_MODE, hljs.QUOTE_STRING_MODE]
			},
			CSS_NUMBER_MODE: {
				scope: "number",
				begin: hljs.NUMBER_RE + "(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",
				relevance: 0
			},
			CSS_VARIABLE: {
				className: "attr",
				begin: /--[A-Za-z_][A-Za-z0-9_-]*/
			}
		};
	};
	HTML_TAGS = [
		"a",
		"abbr",
		"address",
		"article",
		"aside",
		"audio",
		"b",
		"blockquote",
		"body",
		"button",
		"canvas",
		"caption",
		"cite",
		"code",
		"dd",
		"del",
		"details",
		"dfn",
		"div",
		"dl",
		"dt",
		"em",
		"fieldset",
		"figcaption",
		"figure",
		"footer",
		"form",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"header",
		"hgroup",
		"html",
		"i",
		"iframe",
		"img",
		"input",
		"ins",
		"kbd",
		"label",
		"legend",
		"li",
		"main",
		"mark",
		"menu",
		"nav",
		"object",
		"ol",
		"optgroup",
		"option",
		"p",
		"picture",
		"q",
		"quote",
		"samp",
		"section",
		"select",
		"source",
		"span",
		"strong",
		"summary",
		"sup",
		"table",
		"tbody",
		"td",
		"textarea",
		"tfoot",
		"th",
		"thead",
		"time",
		"tr",
		"ul",
		"var",
		"video"
	];
	SVG_TAGS = [
		"defs",
		"g",
		"marker",
		"mask",
		"pattern",
		"svg",
		"switch",
		"symbol",
		"feBlend",
		"feColorMatrix",
		"feComponentTransfer",
		"feComposite",
		"feConvolveMatrix",
		"feDiffuseLighting",
		"feDisplacementMap",
		"feFlood",
		"feGaussianBlur",
		"feImage",
		"feMerge",
		"feMorphology",
		"feOffset",
		"feSpecularLighting",
		"feTile",
		"feTurbulence",
		"linearGradient",
		"radialGradient",
		"stop",
		"circle",
		"ellipse",
		"image",
		"line",
		"path",
		"polygon",
		"polyline",
		"rect",
		"text",
		"use",
		"textPath",
		"tspan",
		"foreignObject",
		"clipPath"
	];
	TAGS = [...HTML_TAGS, ...SVG_TAGS];
	MEDIA_FEATURES = [
		"any-hover",
		"any-pointer",
		"aspect-ratio",
		"color",
		"color-gamut",
		"color-index",
		"device-aspect-ratio",
		"device-height",
		"device-width",
		"display-mode",
		"forced-colors",
		"grid",
		"height",
		"hover",
		"inverted-colors",
		"monochrome",
		"orientation",
		"overflow-block",
		"overflow-inline",
		"pointer",
		"prefers-color-scheme",
		"prefers-contrast",
		"prefers-reduced-motion",
		"prefers-reduced-transparency",
		"resolution",
		"scan",
		"scripting",
		"update",
		"width",
		"min-width",
		"max-width",
		"min-height",
		"max-height"
	].sort().reverse();
	PSEUDO_CLASSES = [
		"active",
		"any-link",
		"blank",
		"checked",
		"current",
		"default",
		"defined",
		"dir",
		"disabled",
		"drop",
		"empty",
		"enabled",
		"first",
		"first-child",
		"first-of-type",
		"fullscreen",
		"future",
		"focus",
		"focus-visible",
		"focus-within",
		"has",
		"host",
		"host-context",
		"hover",
		"indeterminate",
		"in-range",
		"invalid",
		"is",
		"lang",
		"last-child",
		"last-of-type",
		"left",
		"link",
		"local-link",
		"not",
		"nth-child",
		"nth-col",
		"nth-last-child",
		"nth-last-col",
		"nth-last-of-type",
		"nth-of-type",
		"only-child",
		"only-of-type",
		"optional",
		"out-of-range",
		"past",
		"placeholder-shown",
		"read-only",
		"read-write",
		"required",
		"right",
		"root",
		"scope",
		"target",
		"target-within",
		"user-invalid",
		"valid",
		"visited",
		"where"
	].sort().reverse();
	PSEUDO_ELEMENTS = [
		"after",
		"backdrop",
		"before",
		"cue",
		"cue-region",
		"first-letter",
		"first-line",
		"grammar-error",
		"marker",
		"part",
		"placeholder",
		"selection",
		"slotted",
		"spelling-error"
	].sort().reverse();
	ATTRIBUTES = [
		"accent-color",
		"align-content",
		"align-items",
		"align-self",
		"alignment-baseline",
		"all",
		"anchor-name",
		"animation",
		"animation-composition",
		"animation-delay",
		"animation-direction",
		"animation-duration",
		"animation-fill-mode",
		"animation-iteration-count",
		"animation-name",
		"animation-play-state",
		"animation-range",
		"animation-range-end",
		"animation-range-start",
		"animation-timeline",
		"animation-timing-function",
		"appearance",
		"aspect-ratio",
		"backdrop-filter",
		"backface-visibility",
		"background",
		"background-attachment",
		"background-blend-mode",
		"background-clip",
		"background-color",
		"background-image",
		"background-origin",
		"background-position",
		"background-position-x",
		"background-position-y",
		"background-repeat",
		"background-size",
		"baseline-shift",
		"block-size",
		"border",
		"border-block",
		"border-block-color",
		"border-block-end",
		"border-block-end-color",
		"border-block-end-style",
		"border-block-end-width",
		"border-block-start",
		"border-block-start-color",
		"border-block-start-style",
		"border-block-start-width",
		"border-block-style",
		"border-block-width",
		"border-bottom",
		"border-bottom-color",
		"border-bottom-left-radius",
		"border-bottom-right-radius",
		"border-bottom-style",
		"border-bottom-width",
		"border-collapse",
		"border-color",
		"border-end-end-radius",
		"border-end-start-radius",
		"border-image",
		"border-image-outset",
		"border-image-repeat",
		"border-image-slice",
		"border-image-source",
		"border-image-width",
		"border-inline",
		"border-inline-color",
		"border-inline-end",
		"border-inline-end-color",
		"border-inline-end-style",
		"border-inline-end-width",
		"border-inline-start",
		"border-inline-start-color",
		"border-inline-start-style",
		"border-inline-start-width",
		"border-inline-style",
		"border-inline-width",
		"border-left",
		"border-left-color",
		"border-left-style",
		"border-left-width",
		"border-radius",
		"border-right",
		"border-right-color",
		"border-right-style",
		"border-right-width",
		"border-spacing",
		"border-start-end-radius",
		"border-start-start-radius",
		"border-style",
		"border-top",
		"border-top-color",
		"border-top-left-radius",
		"border-top-right-radius",
		"border-top-style",
		"border-top-width",
		"border-width",
		"bottom",
		"box-align",
		"box-decoration-break",
		"box-direction",
		"box-flex",
		"box-flex-group",
		"box-lines",
		"box-ordinal-group",
		"box-orient",
		"box-pack",
		"box-shadow",
		"box-sizing",
		"break-after",
		"break-before",
		"break-inside",
		"caption-side",
		"caret-color",
		"clear",
		"clip",
		"clip-path",
		"clip-rule",
		"color",
		"color-interpolation",
		"color-interpolation-filters",
		"color-profile",
		"color-rendering",
		"color-scheme",
		"column-count",
		"column-fill",
		"column-gap",
		"column-rule",
		"column-rule-color",
		"column-rule-style",
		"column-rule-width",
		"column-span",
		"column-width",
		"columns",
		"contain",
		"contain-intrinsic-block-size",
		"contain-intrinsic-height",
		"contain-intrinsic-inline-size",
		"contain-intrinsic-size",
		"contain-intrinsic-width",
		"container",
		"container-name",
		"container-type",
		"content",
		"content-visibility",
		"corner-bottom-left-shape",
		"corner-bottom-right-shape",
		"corner-shape",
		"corner-top-left-shape",
		"corner-top-right-shape",
		"counter-increment",
		"counter-reset",
		"counter-set",
		"cue",
		"cue-after",
		"cue-before",
		"cursor",
		"cx",
		"cy",
		"direction",
		"display",
		"dominant-baseline",
		"empty-cells",
		"enable-background",
		"field-sizing",
		"fill",
		"fill-opacity",
		"fill-rule",
		"filter",
		"flex",
		"flex-basis",
		"flex-direction",
		"flex-flow",
		"flex-grow",
		"flex-shrink",
		"flex-wrap",
		"float",
		"flood-color",
		"flood-opacity",
		"flow",
		"font",
		"font-display",
		"font-family",
		"font-feature-settings",
		"font-kerning",
		"font-language-override",
		"font-optical-sizing",
		"font-palette",
		"font-size",
		"font-size-adjust",
		"font-smooth",
		"font-smoothing",
		"font-stretch",
		"font-style",
		"font-synthesis",
		"font-synthesis-position",
		"font-synthesis-small-caps",
		"font-synthesis-style",
		"font-synthesis-weight",
		"font-variant",
		"font-variant-alternates",
		"font-variant-caps",
		"font-variant-east-asian",
		"font-variant-emoji",
		"font-variant-ligatures",
		"font-variant-numeric",
		"font-variant-position",
		"font-variation-settings",
		"font-weight",
		"forced-color-adjust",
		"gap",
		"glyph-orientation-horizontal",
		"glyph-orientation-vertical",
		"grid",
		"grid-area",
		"grid-auto-columns",
		"grid-auto-flow",
		"grid-auto-rows",
		"grid-column",
		"grid-column-end",
		"grid-column-start",
		"grid-gap",
		"grid-row",
		"grid-row-end",
		"grid-row-start",
		"grid-template",
		"grid-template-areas",
		"grid-template-columns",
		"grid-template-rows",
		"hanging-punctuation",
		"height",
		"hyphenate-character",
		"hyphenate-limit-chars",
		"hyphens",
		"icon",
		"image-orientation",
		"image-rendering",
		"image-resolution",
		"ime-mode",
		"initial-letter",
		"initial-letter-align",
		"inline-size",
		"inset",
		"inset-area",
		"inset-block",
		"inset-block-end",
		"inset-block-start",
		"inset-inline",
		"inset-inline-end",
		"inset-inline-start",
		"isolation",
		"justify-content",
		"justify-items",
		"justify-self",
		"kerning",
		"left",
		"letter-spacing",
		"lighting-color",
		"line-break",
		"line-height",
		"line-height-step",
		"list-style",
		"list-style-image",
		"list-style-position",
		"list-style-type",
		"margin",
		"margin-block",
		"margin-block-end",
		"margin-block-start",
		"margin-bottom",
		"margin-inline",
		"margin-inline-end",
		"margin-inline-start",
		"margin-left",
		"margin-right",
		"margin-top",
		"margin-trim",
		"marker",
		"marker-end",
		"marker-mid",
		"marker-start",
		"marks",
		"mask",
		"mask-border",
		"mask-border-mode",
		"mask-border-outset",
		"mask-border-repeat",
		"mask-border-slice",
		"mask-border-source",
		"mask-border-width",
		"mask-clip",
		"mask-composite",
		"mask-image",
		"mask-mode",
		"mask-origin",
		"mask-position",
		"mask-repeat",
		"mask-size",
		"mask-type",
		"masonry-auto-flow",
		"math-depth",
		"math-shift",
		"math-style",
		"max-block-size",
		"max-height",
		"max-inline-size",
		"max-width",
		"min-block-size",
		"min-height",
		"min-inline-size",
		"min-width",
		"mix-blend-mode",
		"nav-down",
		"nav-index",
		"nav-left",
		"nav-right",
		"nav-up",
		"none",
		"normal",
		"object-fit",
		"object-position",
		"offset",
		"offset-anchor",
		"offset-distance",
		"offset-path",
		"offset-position",
		"offset-rotate",
		"opacity",
		"order",
		"orphans",
		"outline",
		"outline-color",
		"outline-offset",
		"outline-style",
		"outline-width",
		"overflow",
		"overflow-anchor",
		"overflow-block",
		"overflow-clip-margin",
		"overflow-inline",
		"overflow-wrap",
		"overflow-x",
		"overflow-y",
		"overlay",
		"overscroll-behavior",
		"overscroll-behavior-block",
		"overscroll-behavior-inline",
		"overscroll-behavior-x",
		"overscroll-behavior-y",
		"padding",
		"padding-block",
		"padding-block-end",
		"padding-block-start",
		"padding-bottom",
		"padding-inline",
		"padding-inline-end",
		"padding-inline-start",
		"padding-left",
		"padding-right",
		"padding-top",
		"page",
		"page-break-after",
		"page-break-before",
		"page-break-inside",
		"paint-order",
		"pause",
		"pause-after",
		"pause-before",
		"perspective",
		"perspective-origin",
		"place-content",
		"place-items",
		"place-self",
		"pointer-events",
		"position",
		"position-anchor",
		"position-visibility",
		"print-color-adjust",
		"quotes",
		"r",
		"resize",
		"rest",
		"rest-after",
		"rest-before",
		"right",
		"rotate",
		"row-gap",
		"ruby-align",
		"ruby-position",
		"scale",
		"scroll-behavior",
		"scroll-margin",
		"scroll-margin-block",
		"scroll-margin-block-end",
		"scroll-margin-block-start",
		"scroll-margin-bottom",
		"scroll-margin-inline",
		"scroll-margin-inline-end",
		"scroll-margin-inline-start",
		"scroll-margin-left",
		"scroll-margin-right",
		"scroll-margin-top",
		"scroll-padding",
		"scroll-padding-block",
		"scroll-padding-block-end",
		"scroll-padding-block-start",
		"scroll-padding-bottom",
		"scroll-padding-inline",
		"scroll-padding-inline-end",
		"scroll-padding-inline-start",
		"scroll-padding-left",
		"scroll-padding-right",
		"scroll-padding-top",
		"scroll-snap-align",
		"scroll-snap-stop",
		"scroll-snap-type",
		"scroll-timeline",
		"scroll-timeline-axis",
		"scroll-timeline-name",
		"scrollbar-color",
		"scrollbar-gutter",
		"scrollbar-width",
		"shape-image-threshold",
		"shape-margin",
		"shape-outside",
		"shape-rendering",
		"speak",
		"speak-as",
		"src",
		"stop-color",
		"stop-opacity",
		"stroke",
		"stroke-dasharray",
		"stroke-dashoffset",
		"stroke-linecap",
		"stroke-linejoin",
		"stroke-miterlimit",
		"stroke-opacity",
		"stroke-width",
		"tab-size",
		"table-layout",
		"text-align",
		"text-align-all",
		"text-align-last",
		"text-anchor",
		"text-combine-upright",
		"text-decoration",
		"text-decoration-color",
		"text-decoration-line",
		"text-decoration-skip",
		"text-decoration-skip-ink",
		"text-decoration-style",
		"text-decoration-thickness",
		"text-emphasis",
		"text-emphasis-color",
		"text-emphasis-position",
		"text-emphasis-style",
		"text-indent",
		"text-justify",
		"text-orientation",
		"text-overflow",
		"text-rendering",
		"text-shadow",
		"text-size-adjust",
		"text-transform",
		"text-underline-offset",
		"text-underline-position",
		"text-wrap",
		"text-wrap-mode",
		"text-wrap-style",
		"timeline-scope",
		"top",
		"touch-action",
		"transform",
		"transform-box",
		"transform-origin",
		"transform-style",
		"transition",
		"transition-behavior",
		"transition-delay",
		"transition-duration",
		"transition-property",
		"transition-timing-function",
		"translate",
		"unicode-bidi",
		"unicode-range",
		"user-modify",
		"user-select",
		"vector-effect",
		"vertical-align",
		"view-timeline",
		"view-timeline-axis",
		"view-timeline-inset",
		"view-timeline-name",
		"view-transition-name",
		"visibility",
		"voice-balance",
		"voice-duration",
		"voice-family",
		"voice-pitch",
		"voice-range",
		"voice-rate",
		"voice-stress",
		"voice-volume",
		"white-space",
		"white-space-collapse",
		"widows",
		"width",
		"will-change",
		"word-break",
		"word-spacing",
		"word-wrap",
		"writing-mode",
		"x",
		"y",
		"z-index",
		"zoom"
	].sort().reverse();
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/javascript.js
/** @type LanguageFn */
function javascript$1(hljs) {
	const regex = hljs.regex;
	/**
	* Takes a string like "<Booger" and checks to see
	* if we can find a matching "</Booger" later in the
	* content.
	* @param {RegExpMatchArray} match
	* @param {{after:number}} param1
	*/
	const hasClosingTag = (match, { after }) => {
		const tag = "</" + match[0].slice(1);
		return match.input.indexOf(tag, after) !== -1;
	};
	const IDENT_RE$1 = IDENT_RE$2;
	const FRAGMENT = {
		begin: "<>",
		end: "</>"
	};
	const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
	const XML_TAG = {
		begin: /<[A-Za-z0-9\\._:-]+/,
		end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
		/**
		* @param {RegExpMatchArray} match
		* @param {CallbackResponse} response
		*/
		isTrulyOpeningTag: (match, response) => {
			const afterMatchIndex = match[0].length + match.index;
			const nextChar = match.input[afterMatchIndex];
			if (nextChar === "<" || nextChar === ",") {
				response.ignoreMatch();
				return;
			}
			if (nextChar === ">") {
				if (!hasClosingTag(match, { after: afterMatchIndex })) response.ignoreMatch();
			}
			let m;
			const afterMatch = match.input.substring(afterMatchIndex);
			if (m = afterMatch.match(/^\s*=/)) {
				response.ignoreMatch();
				return;
			}
			if (m = afterMatch.match(/^\s+extends\s+/)) {
				if (m.index === 0) {
					response.ignoreMatch();
					return;
				}
			}
		}
	};
	const KEYWORDS$1 = {
		$pattern: IDENT_RE$2,
		keyword: KEYWORDS$2,
		literal: LITERALS$1,
		built_in: BUILT_INS$1,
		"variable.language": BUILT_IN_VARIABLES$1
	};
	const decimalDigits = "[0-9](_?[0-9])*";
	const frac = `\\.(${decimalDigits})`;
	const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
	const NUMBER = {
		className: "number",
		variants: [
			{ begin: `(\\b(${decimalInteger})((${frac})|\\.)?|(${frac}))[eE][+-]?(${decimalDigits})\\b` },
			{ begin: `\\b(${decimalInteger})\\b((${frac})\\b|\\.)?|(${frac})\\b` },
			{ begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },
			{ begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
			{ begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
			{ begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },
			{ begin: "\\b0[0-7]+n?\\b" }
		],
		relevance: 0
	};
	const SUBST = {
		className: "subst",
		begin: "\\$\\{",
		end: "\\}",
		keywords: KEYWORDS$1,
		contains: []
	};
	const HTML_TEMPLATE = {
		begin: ".?html`",
		end: "",
		starts: {
			end: "`",
			returnEnd: false,
			contains: [hljs.BACKSLASH_ESCAPE, SUBST],
			subLanguage: "xml"
		}
	};
	const CSS_TEMPLATE = {
		begin: ".?css`",
		end: "",
		starts: {
			end: "`",
			returnEnd: false,
			contains: [hljs.BACKSLASH_ESCAPE, SUBST],
			subLanguage: "css"
		}
	};
	const GRAPHQL_TEMPLATE = {
		begin: ".?gql`",
		end: "",
		starts: {
			end: "`",
			returnEnd: false,
			contains: [hljs.BACKSLASH_ESCAPE, SUBST],
			subLanguage: "graphql"
		}
	};
	const TEMPLATE_STRING = {
		className: "string",
		begin: "`",
		end: "`",
		contains: [hljs.BACKSLASH_ESCAPE, SUBST]
	};
	const COMMENT = {
		className: "comment",
		variants: [
			hljs.COMMENT(/\/\*\*(?!\/)/, "\\*/", {
				relevance: 0,
				contains: [{
					begin: "(?=@[A-Za-z]+)",
					relevance: 0,
					contains: [
						{
							className: "doctag",
							begin: "@[A-Za-z]+"
						},
						{
							className: "type",
							begin: "\\{",
							end: "\\}",
							excludeEnd: true,
							excludeBegin: true,
							relevance: 0
						},
						{
							className: "variable",
							begin: IDENT_RE$1 + "(?=\\s*(-)|$)",
							endsParent: true,
							relevance: 0
						},
						{
							begin: /(?=[^\n])\s/,
							relevance: 0
						}
					]
				}]
			}),
			hljs.C_BLOCK_COMMENT_MODE,
			hljs.C_LINE_COMMENT_MODE
		]
	};
	const SUBST_INTERNALS = [
		hljs.APOS_STRING_MODE,
		hljs.QUOTE_STRING_MODE,
		HTML_TEMPLATE,
		CSS_TEMPLATE,
		GRAPHQL_TEMPLATE,
		TEMPLATE_STRING,
		{ match: /\$\d+/ },
		NUMBER
	];
	SUBST.contains = SUBST_INTERNALS.concat({
		begin: /\{/,
		end: /\}/,
		keywords: KEYWORDS$1,
		contains: ["self"].concat(SUBST_INTERNALS)
	});
	const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
	const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([{
		begin: /(\s*)\(/,
		end: /\)/,
		keywords: KEYWORDS$1,
		contains: ["self"].concat(SUBST_AND_COMMENTS)
	}]);
	const PARAMS = {
		className: "params",
		begin: /(\s*)\(/,
		end: /\)/,
		excludeBegin: true,
		excludeEnd: true,
		keywords: KEYWORDS$1,
		contains: PARAMS_CONTAINS
	};
	const CLASS_OR_EXTENDS = { variants: [{
		match: [
			/class/,
			/\s+/,
			IDENT_RE$1,
			/\s+/,
			/extends/,
			/\s+/,
			regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
		],
		scope: {
			1: "keyword",
			3: "title.class",
			5: "keyword",
			7: "title.class.inherited"
		}
	}, {
		match: [
			/class/,
			/\s+/,
			IDENT_RE$1
		],
		scope: {
			1: "keyword",
			3: "title.class"
		}
	}] };
	const CLASS_REFERENCE = {
		relevance: 0,
		match: regex.either(/\bJSON/, /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/, /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/, /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/),
		className: "title.class",
		keywords: { _: [...TYPES$1, ...ERROR_TYPES$1] }
	};
	const USE_STRICT = {
		label: "use_strict",
		className: "meta",
		relevance: 10,
		begin: /^\s*['"]use (strict|asm)['"]/
	};
	const FUNCTION_DEFINITION = {
		variants: [{ match: [
			/function/,
			/\s+/,
			IDENT_RE$1,
			/(?=\s*\()/
		] }, { match: [/function/, /\s*(?=\()/] }],
		className: {
			1: "keyword",
			3: "title.function"
		},
		label: "func.def",
		contains: [PARAMS],
		illegal: /%/
	};
	const UPPER_CASE_CONSTANT = {
		relevance: 0,
		match: /\b[A-Z][A-Z_0-9]+\b/,
		className: "variable.constant"
	};
	function noneOf(list) {
		return regex.concat("(?!", list.join("|"), ")");
	}
	const FUNCTION_CALL = {
		match: regex.concat(/\b/, noneOf([
			...BUILT_IN_GLOBALS$1,
			"super",
			"import",
			"await"
		].map((x) => `${x}\\s*\\(`)), IDENT_RE$1, regex.lookahead(/\s*\(/)),
		className: "title.function",
		relevance: 0
	};
	const PROPERTY_ACCESS = {
		begin: regex.concat(/\./, regex.lookahead(regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/))),
		end: IDENT_RE$1,
		excludeBegin: true,
		keywords: "prototype",
		className: "property",
		relevance: 0
	};
	const GETTER_OR_SETTER = {
		match: [
			/get|set/,
			/\s+/,
			IDENT_RE$1,
			/(?=\()/
		],
		className: {
			1: "keyword",
			3: "title.function"
		},
		contains: [{ begin: /\(\)/ }, PARAMS]
	};
	const FUNC_LEAD_IN_RE = "(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|" + hljs.UNDERSCORE_IDENT_RE + ")\\s*=>";
	const FUNCTION_VARIABLE = {
		match: [
			/const|var|let/,
			/\s+/,
			IDENT_RE$1,
			/\s*/,
			/=\s*/,
			/(async\s*)?/,
			regex.lookahead(FUNC_LEAD_IN_RE)
		],
		keywords: "async",
		className: {
			1: "keyword",
			3: "title.function"
		},
		contains: [PARAMS]
	};
	return {
		name: "JavaScript",
		aliases: [
			"js",
			"jsx",
			"mjs",
			"cjs"
		],
		keywords: KEYWORDS$1,
		exports: {
			PARAMS_CONTAINS,
			CLASS_REFERENCE
		},
		illegal: /#(?![$_A-Za-z])/,
		contains: [
			hljs.SHEBANG({
				label: "shebang",
				binary: "node",
				relevance: 5
			}),
			USE_STRICT,
			hljs.APOS_STRING_MODE,
			hljs.QUOTE_STRING_MODE,
			HTML_TEMPLATE,
			CSS_TEMPLATE,
			GRAPHQL_TEMPLATE,
			TEMPLATE_STRING,
			COMMENT,
			{ match: /\$\d+/ },
			NUMBER,
			CLASS_REFERENCE,
			{
				scope: "attr",
				match: IDENT_RE$1 + regex.lookahead(":"),
				relevance: 0
			},
			FUNCTION_VARIABLE,
			{
				begin: "(" + hljs.RE_STARTERS_RE + "|\\b(case|return|throw)\\b)\\s*",
				keywords: "return throw case",
				relevance: 0,
				contains: [
					COMMENT,
					hljs.REGEXP_MODE,
					{
						className: "function",
						begin: FUNC_LEAD_IN_RE,
						returnBegin: true,
						end: "\\s*=>",
						contains: [{
							className: "params",
							variants: [
								{
									begin: hljs.UNDERSCORE_IDENT_RE,
									relevance: 0
								},
								{
									className: null,
									begin: /\(\s*\)/,
									skip: true
								},
								{
									begin: /(\s*)\(/,
									end: /\)/,
									excludeBegin: true,
									excludeEnd: true,
									keywords: KEYWORDS$1,
									contains: PARAMS_CONTAINS
								}
							]
						}]
					},
					{
						begin: /,/,
						relevance: 0
					},
					{
						match: /\s+/,
						relevance: 0
					},
					{
						variants: [
							{
								begin: FRAGMENT.begin,
								end: FRAGMENT.end
							},
							{ match: XML_SELF_CLOSING },
							{
								begin: XML_TAG.begin,
								"on:begin": XML_TAG.isTrulyOpeningTag,
								end: XML_TAG.end
							}
						],
						subLanguage: "xml",
						contains: [{
							begin: XML_TAG.begin,
							end: XML_TAG.end,
							skip: true,
							contains: ["self"]
						}]
					}
				]
			},
			FUNCTION_DEFINITION,
			{ beginKeywords: "while if switch catch for" },
			{
				begin: "\\b(?!function)" + hljs.UNDERSCORE_IDENT_RE + "\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",
				returnBegin: true,
				label: "func.def",
				contains: [PARAMS, hljs.inherit(hljs.TITLE_MODE, {
					begin: IDENT_RE$1,
					className: "title.function"
				})]
			},
			{
				match: /\.\.\./,
				relevance: 0
			},
			PROPERTY_ACCESS,
			{
				match: "\\$" + IDENT_RE$1,
				relevance: 0
			},
			{
				match: [/\bconstructor(?=\s*\()/],
				className: { 1: "title.function" },
				contains: [PARAMS]
			},
			FUNCTION_CALL,
			UPPER_CASE_CONSTANT,
			CLASS_OR_EXTENDS,
			GETTER_OR_SETTER,
			{ match: /\$[(.]/ }
		]
	};
}
var IDENT_RE$2, KEYWORDS$2, LITERALS$1, TYPES$1, ERROR_TYPES$1, BUILT_IN_GLOBALS$1, BUILT_IN_VARIABLES$1, BUILT_INS$1;
var init_javascript = __esmMin((() => {
	IDENT_RE$2 = "[A-Za-z$_][0-9A-Za-z$_]*";
	KEYWORDS$2 = [
		"as",
		"in",
		"of",
		"if",
		"for",
		"while",
		"finally",
		"var",
		"new",
		"function",
		"do",
		"return",
		"void",
		"else",
		"break",
		"catch",
		"instanceof",
		"with",
		"throw",
		"case",
		"default",
		"try",
		"switch",
		"continue",
		"typeof",
		"delete",
		"let",
		"yield",
		"const",
		"class",
		"debugger",
		"async",
		"await",
		"static",
		"import",
		"from",
		"export",
		"extends",
		"using"
	];
	LITERALS$1 = [
		"true",
		"false",
		"null",
		"undefined",
		"NaN",
		"Infinity"
	];
	TYPES$1 = [
		"Object",
		"Function",
		"Boolean",
		"Symbol",
		"Math",
		"Date",
		"Number",
		"BigInt",
		"String",
		"RegExp",
		"Array",
		"Float32Array",
		"Float64Array",
		"Int8Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"Int16Array",
		"Int32Array",
		"Uint16Array",
		"Uint32Array",
		"BigInt64Array",
		"BigUint64Array",
		"Set",
		"Map",
		"WeakSet",
		"WeakMap",
		"ArrayBuffer",
		"SharedArrayBuffer",
		"Atomics",
		"DataView",
		"JSON",
		"Promise",
		"Generator",
		"GeneratorFunction",
		"AsyncFunction",
		"Reflect",
		"Proxy",
		"Intl",
		"WebAssembly"
	];
	ERROR_TYPES$1 = [
		"Error",
		"EvalError",
		"InternalError",
		"RangeError",
		"ReferenceError",
		"SyntaxError",
		"TypeError",
		"URIError"
	];
	BUILT_IN_GLOBALS$1 = [
		"setInterval",
		"setTimeout",
		"clearInterval",
		"clearTimeout",
		"require",
		"exports",
		"eval",
		"isFinite",
		"isNaN",
		"parseFloat",
		"parseInt",
		"decodeURI",
		"decodeURIComponent",
		"encodeURI",
		"encodeURIComponent",
		"escape",
		"unescape"
	];
	BUILT_IN_VARIABLES$1 = [
		"arguments",
		"this",
		"super",
		"console",
		"window",
		"document",
		"localStorage",
		"sessionStorage",
		"module",
		"self",
		"global"
	];
	BUILT_INS$1 = [].concat(BUILT_IN_GLOBALS$1, TYPES$1, ERROR_TYPES$1);
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/json.js
function json(hljs) {
	const ATTRIBUTE = {
		className: "attr",
		begin: /(("(\\.|[^\\"\r\n])*")|('(\\.|[^\\'\r\n])*'))(?=\s*:)/,
		relevance: 1.01
	};
	const PUNCTUATION = {
		match: /[{}[\],:]/,
		className: "punctuation",
		relevance: 0
	};
	const LITERALS = [
		"true",
		"false",
		"null"
	];
	const LITERALS_MODE = {
		scope: "literal",
		beginKeywords: LITERALS.join(" ")
	};
	return {
		name: "JSON",
		aliases: ["jsonc", "json5"],
		keywords: { literal: LITERALS },
		contains: [
			ATTRIBUTE,
			PUNCTUATION,
			hljs.APOS_STRING_MODE,
			hljs.QUOTE_STRING_MODE,
			LITERALS_MODE,
			EXTENDED_NUMBER_MODE,
			hljs.C_LINE_COMMENT_MODE,
			hljs.C_BLOCK_COMMENT_MODE
		],
		illegal: "\\S"
	};
}
var EXTENDED_NUMBER_MODE;
var init_json = __esmMin((() => {
	EXTENDED_NUMBER_MODE = {
		scope: "number",
		match: "([-+]?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)|NaN|[-+]?Infinity",
		relevance: 0
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/typescript.js
/** @type LanguageFn */
function javascript(hljs) {
	const regex = hljs.regex;
	/**
	* Takes a string like "<Booger" and checks to see
	* if we can find a matching "</Booger" later in the
	* content.
	* @param {RegExpMatchArray} match
	* @param {{after:number}} param1
	*/
	const hasClosingTag = (match, { after }) => {
		const tag = "</" + match[0].slice(1);
		return match.input.indexOf(tag, after) !== -1;
	};
	const IDENT_RE$1 = IDENT_RE;
	const FRAGMENT = {
		begin: "<>",
		end: "</>"
	};
	const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
	const XML_TAG = {
		begin: /<[A-Za-z0-9\\._:-]+/,
		end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
		/**
		* @param {RegExpMatchArray} match
		* @param {CallbackResponse} response
		*/
		isTrulyOpeningTag: (match, response) => {
			const afterMatchIndex = match[0].length + match.index;
			const nextChar = match.input[afterMatchIndex];
			if (nextChar === "<" || nextChar === ",") {
				response.ignoreMatch();
				return;
			}
			if (nextChar === ">") {
				if (!hasClosingTag(match, { after: afterMatchIndex })) response.ignoreMatch();
			}
			let m;
			const afterMatch = match.input.substring(afterMatchIndex);
			if (m = afterMatch.match(/^\s*=/)) {
				response.ignoreMatch();
				return;
			}
			if (m = afterMatch.match(/^\s+extends\s+/)) {
				if (m.index === 0) {
					response.ignoreMatch();
					return;
				}
			}
		}
	};
	const KEYWORDS$1 = {
		$pattern: IDENT_RE,
		keyword: KEYWORDS,
		literal: LITERALS,
		built_in: BUILT_INS,
		"variable.language": BUILT_IN_VARIABLES
	};
	const decimalDigits = "[0-9](_?[0-9])*";
	const frac = `\\.(${decimalDigits})`;
	const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
	const NUMBER = {
		className: "number",
		variants: [
			{ begin: `(\\b(${decimalInteger})((${frac})|\\.)?|(${frac}))[eE][+-]?(${decimalDigits})\\b` },
			{ begin: `\\b(${decimalInteger})\\b((${frac})\\b|\\.)?|(${frac})\\b` },
			{ begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },
			{ begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
			{ begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
			{ begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },
			{ begin: "\\b0[0-7]+n?\\b" }
		],
		relevance: 0
	};
	const SUBST = {
		className: "subst",
		begin: "\\$\\{",
		end: "\\}",
		keywords: KEYWORDS$1,
		contains: []
	};
	const HTML_TEMPLATE = {
		begin: ".?html`",
		end: "",
		starts: {
			end: "`",
			returnEnd: false,
			contains: [hljs.BACKSLASH_ESCAPE, SUBST],
			subLanguage: "xml"
		}
	};
	const CSS_TEMPLATE = {
		begin: ".?css`",
		end: "",
		starts: {
			end: "`",
			returnEnd: false,
			contains: [hljs.BACKSLASH_ESCAPE, SUBST],
			subLanguage: "css"
		}
	};
	const GRAPHQL_TEMPLATE = {
		begin: ".?gql`",
		end: "",
		starts: {
			end: "`",
			returnEnd: false,
			contains: [hljs.BACKSLASH_ESCAPE, SUBST],
			subLanguage: "graphql"
		}
	};
	const TEMPLATE_STRING = {
		className: "string",
		begin: "`",
		end: "`",
		contains: [hljs.BACKSLASH_ESCAPE, SUBST]
	};
	const COMMENT = {
		className: "comment",
		variants: [
			hljs.COMMENT(/\/\*\*(?!\/)/, "\\*/", {
				relevance: 0,
				contains: [{
					begin: "(?=@[A-Za-z]+)",
					relevance: 0,
					contains: [
						{
							className: "doctag",
							begin: "@[A-Za-z]+"
						},
						{
							className: "type",
							begin: "\\{",
							end: "\\}",
							excludeEnd: true,
							excludeBegin: true,
							relevance: 0
						},
						{
							className: "variable",
							begin: IDENT_RE$1 + "(?=\\s*(-)|$)",
							endsParent: true,
							relevance: 0
						},
						{
							begin: /(?=[^\n])\s/,
							relevance: 0
						}
					]
				}]
			}),
			hljs.C_BLOCK_COMMENT_MODE,
			hljs.C_LINE_COMMENT_MODE
		]
	};
	const SUBST_INTERNALS = [
		hljs.APOS_STRING_MODE,
		hljs.QUOTE_STRING_MODE,
		HTML_TEMPLATE,
		CSS_TEMPLATE,
		GRAPHQL_TEMPLATE,
		TEMPLATE_STRING,
		{ match: /\$\d+/ },
		NUMBER
	];
	SUBST.contains = SUBST_INTERNALS.concat({
		begin: /\{/,
		end: /\}/,
		keywords: KEYWORDS$1,
		contains: ["self"].concat(SUBST_INTERNALS)
	});
	const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
	const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([{
		begin: /(\s*)\(/,
		end: /\)/,
		keywords: KEYWORDS$1,
		contains: ["self"].concat(SUBST_AND_COMMENTS)
	}]);
	const PARAMS = {
		className: "params",
		begin: /(\s*)\(/,
		end: /\)/,
		excludeBegin: true,
		excludeEnd: true,
		keywords: KEYWORDS$1,
		contains: PARAMS_CONTAINS
	};
	const CLASS_OR_EXTENDS = { variants: [{
		match: [
			/class/,
			/\s+/,
			IDENT_RE$1,
			/\s+/,
			/extends/,
			/\s+/,
			regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
		],
		scope: {
			1: "keyword",
			3: "title.class",
			5: "keyword",
			7: "title.class.inherited"
		}
	}, {
		match: [
			/class/,
			/\s+/,
			IDENT_RE$1
		],
		scope: {
			1: "keyword",
			3: "title.class"
		}
	}] };
	const CLASS_REFERENCE = {
		relevance: 0,
		match: regex.either(/\bJSON/, /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/, /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/, /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/),
		className: "title.class",
		keywords: { _: [...TYPES, ...ERROR_TYPES] }
	};
	const USE_STRICT = {
		label: "use_strict",
		className: "meta",
		relevance: 10,
		begin: /^\s*['"]use (strict|asm)['"]/
	};
	const FUNCTION_DEFINITION = {
		variants: [{ match: [
			/function/,
			/\s+/,
			IDENT_RE$1,
			/(?=\s*\()/
		] }, { match: [/function/, /\s*(?=\()/] }],
		className: {
			1: "keyword",
			3: "title.function"
		},
		label: "func.def",
		contains: [PARAMS],
		illegal: /%/
	};
	const UPPER_CASE_CONSTANT = {
		relevance: 0,
		match: /\b[A-Z][A-Z_0-9]+\b/,
		className: "variable.constant"
	};
	function noneOf(list) {
		return regex.concat("(?!", list.join("|"), ")");
	}
	const FUNCTION_CALL = {
		match: regex.concat(/\b/, noneOf([
			...BUILT_IN_GLOBALS,
			"super",
			"import",
			"await"
		].map((x) => `${x}\\s*\\(`)), IDENT_RE$1, regex.lookahead(/\s*\(/)),
		className: "title.function",
		relevance: 0
	};
	const PROPERTY_ACCESS = {
		begin: regex.concat(/\./, regex.lookahead(regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/))),
		end: IDENT_RE$1,
		excludeBegin: true,
		keywords: "prototype",
		className: "property",
		relevance: 0
	};
	const GETTER_OR_SETTER = {
		match: [
			/get|set/,
			/\s+/,
			IDENT_RE$1,
			/(?=\()/
		],
		className: {
			1: "keyword",
			3: "title.function"
		},
		contains: [{ begin: /\(\)/ }, PARAMS]
	};
	const FUNC_LEAD_IN_RE = "(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|" + hljs.UNDERSCORE_IDENT_RE + ")\\s*=>";
	const FUNCTION_VARIABLE = {
		match: [
			/const|var|let/,
			/\s+/,
			IDENT_RE$1,
			/\s*/,
			/=\s*/,
			/(async\s*)?/,
			regex.lookahead(FUNC_LEAD_IN_RE)
		],
		keywords: "async",
		className: {
			1: "keyword",
			3: "title.function"
		},
		contains: [PARAMS]
	};
	return {
		name: "JavaScript",
		aliases: [
			"js",
			"jsx",
			"mjs",
			"cjs"
		],
		keywords: KEYWORDS$1,
		exports: {
			PARAMS_CONTAINS,
			CLASS_REFERENCE
		},
		illegal: /#(?![$_A-Za-z])/,
		contains: [
			hljs.SHEBANG({
				label: "shebang",
				binary: "node",
				relevance: 5
			}),
			USE_STRICT,
			hljs.APOS_STRING_MODE,
			hljs.QUOTE_STRING_MODE,
			HTML_TEMPLATE,
			CSS_TEMPLATE,
			GRAPHQL_TEMPLATE,
			TEMPLATE_STRING,
			COMMENT,
			{ match: /\$\d+/ },
			NUMBER,
			CLASS_REFERENCE,
			{
				scope: "attr",
				match: IDENT_RE$1 + regex.lookahead(":"),
				relevance: 0
			},
			FUNCTION_VARIABLE,
			{
				begin: "(" + hljs.RE_STARTERS_RE + "|\\b(case|return|throw)\\b)\\s*",
				keywords: "return throw case",
				relevance: 0,
				contains: [
					COMMENT,
					hljs.REGEXP_MODE,
					{
						className: "function",
						begin: FUNC_LEAD_IN_RE,
						returnBegin: true,
						end: "\\s*=>",
						contains: [{
							className: "params",
							variants: [
								{
									begin: hljs.UNDERSCORE_IDENT_RE,
									relevance: 0
								},
								{
									className: null,
									begin: /\(\s*\)/,
									skip: true
								},
								{
									begin: /(\s*)\(/,
									end: /\)/,
									excludeBegin: true,
									excludeEnd: true,
									keywords: KEYWORDS$1,
									contains: PARAMS_CONTAINS
								}
							]
						}]
					},
					{
						begin: /,/,
						relevance: 0
					},
					{
						match: /\s+/,
						relevance: 0
					},
					{
						variants: [
							{
								begin: FRAGMENT.begin,
								end: FRAGMENT.end
							},
							{ match: XML_SELF_CLOSING },
							{
								begin: XML_TAG.begin,
								"on:begin": XML_TAG.isTrulyOpeningTag,
								end: XML_TAG.end
							}
						],
						subLanguage: "xml",
						contains: [{
							begin: XML_TAG.begin,
							end: XML_TAG.end,
							skip: true,
							contains: ["self"]
						}]
					}
				]
			},
			FUNCTION_DEFINITION,
			{ beginKeywords: "while if switch catch for" },
			{
				begin: "\\b(?!function)" + hljs.UNDERSCORE_IDENT_RE + "\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",
				returnBegin: true,
				label: "func.def",
				contains: [PARAMS, hljs.inherit(hljs.TITLE_MODE, {
					begin: IDENT_RE$1,
					className: "title.function"
				})]
			},
			{
				match: /\.\.\./,
				relevance: 0
			},
			PROPERTY_ACCESS,
			{
				match: "\\$" + IDENT_RE$1,
				relevance: 0
			},
			{
				match: [/\bconstructor(?=\s*\()/],
				className: { 1: "title.function" },
				contains: [PARAMS]
			},
			FUNCTION_CALL,
			UPPER_CASE_CONSTANT,
			CLASS_OR_EXTENDS,
			GETTER_OR_SETTER,
			{ match: /\$[(.]/ }
		]
	};
}
/** @type LanguageFn */
function typescript(hljs) {
	const regex = hljs.regex;
	const tsLanguage = javascript(hljs);
	const IDENT_RE$1 = IDENT_RE;
	const TYPES = [
		"any",
		"void",
		"number",
		"boolean",
		"string",
		"object",
		"never",
		"symbol",
		"bigint",
		"unknown"
	];
	const NAMESPACE = {
		begin: [
			/namespace/,
			/\s+/,
			hljs.IDENT_RE
		],
		beginScope: {
			1: "keyword",
			3: "title.class"
		}
	};
	const INTERFACE = {
		beginKeywords: "interface",
		end: /\{/,
		excludeEnd: true,
		keywords: {
			keyword: "interface extends",
			built_in: TYPES
		},
		contains: [tsLanguage.exports.CLASS_REFERENCE]
	};
	const USE_STRICT = {
		className: "meta",
		relevance: 10,
		begin: /^\s*['"]use strict['"]/
	};
	const KEYWORDS$1 = {
		$pattern: IDENT_RE,
		keyword: KEYWORDS.concat([
			"type",
			"interface",
			"public",
			"private",
			"protected",
			"implements",
			"declare",
			"abstract",
			"readonly",
			"enum",
			"override",
			"satisfies"
		]),
		literal: LITERALS,
		built_in: BUILT_INS.concat(TYPES),
		"variable.language": BUILT_IN_VARIABLES
	};
	const DECORATOR = {
		className: "meta",
		begin: "@" + IDENT_RE$1
	};
	const swapMode = (mode, label, replacement) => {
		const indx = mode.contains.findIndex((m) => m.label === label);
		if (indx === -1) throw new Error("can not find mode to replace");
		mode.contains.splice(indx, 1, replacement);
	};
	Object.assign(tsLanguage.keywords, KEYWORDS$1);
	tsLanguage.exports.PARAMS_CONTAINS.push(DECORATOR);
	const ATTRIBUTE_HIGHLIGHT = tsLanguage.contains.find((c) => c.scope === "attr");
	const OPTIONAL_KEY_OR_ARGUMENT = Object.assign({}, ATTRIBUTE_HIGHLIGHT, { match: regex.concat(IDENT_RE$1, regex.lookahead(/\s*\?:/)) });
	tsLanguage.exports.PARAMS_CONTAINS.push([
		tsLanguage.exports.CLASS_REFERENCE,
		ATTRIBUTE_HIGHLIGHT,
		OPTIONAL_KEY_OR_ARGUMENT
	]);
	tsLanguage.contains = tsLanguage.contains.concat([
		DECORATOR,
		NAMESPACE,
		INTERFACE,
		OPTIONAL_KEY_OR_ARGUMENT
	]);
	swapMode(tsLanguage, "shebang", hljs.SHEBANG());
	swapMode(tsLanguage, "use_strict", USE_STRICT);
	const functionDeclaration = tsLanguage.contains.find((m) => m.label === "func.def");
	functionDeclaration.relevance = 0;
	Object.assign(tsLanguage, {
		name: "TypeScript",
		aliases: [
			"ts",
			"tsx",
			"mts",
			"cts"
		]
	});
	return tsLanguage;
}
var IDENT_RE, KEYWORDS, LITERALS, TYPES, ERROR_TYPES, BUILT_IN_GLOBALS, BUILT_IN_VARIABLES, BUILT_INS;
var init_typescript = __esmMin((() => {
	IDENT_RE = "[A-Za-z$_][0-9A-Za-z$_]*";
	KEYWORDS = [
		"as",
		"in",
		"of",
		"if",
		"for",
		"while",
		"finally",
		"var",
		"new",
		"function",
		"do",
		"return",
		"void",
		"else",
		"break",
		"catch",
		"instanceof",
		"with",
		"throw",
		"case",
		"default",
		"try",
		"switch",
		"continue",
		"typeof",
		"delete",
		"let",
		"yield",
		"const",
		"class",
		"debugger",
		"async",
		"await",
		"static",
		"import",
		"from",
		"export",
		"extends",
		"using"
	];
	LITERALS = [
		"true",
		"false",
		"null",
		"undefined",
		"NaN",
		"Infinity"
	];
	TYPES = [
		"Object",
		"Function",
		"Boolean",
		"Symbol",
		"Math",
		"Date",
		"Number",
		"BigInt",
		"String",
		"RegExp",
		"Array",
		"Float32Array",
		"Float64Array",
		"Int8Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"Int16Array",
		"Int32Array",
		"Uint16Array",
		"Uint32Array",
		"BigInt64Array",
		"BigUint64Array",
		"Set",
		"Map",
		"WeakSet",
		"WeakMap",
		"ArrayBuffer",
		"SharedArrayBuffer",
		"Atomics",
		"DataView",
		"JSON",
		"Promise",
		"Generator",
		"GeneratorFunction",
		"AsyncFunction",
		"Reflect",
		"Proxy",
		"Intl",
		"WebAssembly"
	];
	ERROR_TYPES = [
		"Error",
		"EvalError",
		"InternalError",
		"RangeError",
		"ReferenceError",
		"SyntaxError",
		"TypeError",
		"URIError"
	];
	BUILT_IN_GLOBALS = [
		"setInterval",
		"setTimeout",
		"clearInterval",
		"clearTimeout",
		"require",
		"exports",
		"eval",
		"isFinite",
		"isNaN",
		"parseFloat",
		"parseInt",
		"decodeURI",
		"decodeURIComponent",
		"encodeURI",
		"encodeURIComponent",
		"escape",
		"unescape"
	];
	BUILT_IN_VARIABLES = [
		"arguments",
		"this",
		"super",
		"console",
		"window",
		"document",
		"localStorage",
		"sessionStorage",
		"module",
		"self",
		"global"
	];
	BUILT_INS = [].concat(BUILT_IN_GLOBALS, TYPES, ERROR_TYPES);
}));
//#endregion
//#region ../../node_modules/.pnpm/highlight.js@11.12.0/node_modules/highlight.js/es/languages/xml.js
/** @type LanguageFn */
function xml(hljs) {
	const regex = hljs.regex;
	const TAG_NAME_RE = regex.concat(/[\p{L}_]/u, regex.optional(/[\p{L}0-9_.-]*:/u), /[\p{L}0-9_.-]*/u);
	const XML_IDENT_RE = /[\p{L}0-9._:-]+/u;
	const XML_ENTITIES = {
		className: "symbol",
		begin: /&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/
	};
	const XML_META_KEYWORDS = {
		begin: /\s/,
		contains: [{
			className: "keyword",
			begin: /#?[a-z_][a-z1-9_-]+/,
			illegal: /\n/
		}]
	};
	const XML_META_PAR_KEYWORDS = hljs.inherit(XML_META_KEYWORDS, {
		begin: /\(/,
		end: /\)/
	});
	const APOS_META_STRING_MODE = hljs.inherit(hljs.APOS_STRING_MODE, { className: "string" });
	const QUOTE_META_STRING_MODE = hljs.inherit(hljs.QUOTE_STRING_MODE, { className: "string" });
	const TAG_INTERNALS = {
		endsWithParent: true,
		illegal: /</,
		relevance: 0,
		contains: [{
			className: "attr",
			begin: XML_IDENT_RE,
			relevance: 0
		}, {
			begin: /=\s*/,
			relevance: 0,
			contains: [{
				className: "string",
				endsParent: true,
				variants: [
					{
						begin: /"/,
						end: /"/,
						contains: [XML_ENTITIES]
					},
					{
						begin: /'/,
						end: /'/,
						contains: [XML_ENTITIES]
					},
					{ begin: /[^\s"'=<>`]+/ }
				]
			}]
		}]
	};
	return {
		name: "HTML, XML",
		aliases: [
			"html",
			"xhtml",
			"rss",
			"atom",
			"xjb",
			"xsd",
			"xsl",
			"plist",
			"wsf",
			"svg"
		],
		case_insensitive: true,
		unicodeRegex: true,
		contains: [
			{
				className: "meta",
				begin: /<![a-z]/,
				end: />/,
				relevance: 10,
				contains: [
					XML_META_KEYWORDS,
					QUOTE_META_STRING_MODE,
					APOS_META_STRING_MODE,
					XML_META_PAR_KEYWORDS,
					{
						begin: /\[/,
						end: /\]/,
						contains: [{
							className: "meta",
							begin: /<![a-z]/,
							end: />/,
							contains: [
								XML_META_KEYWORDS,
								XML_META_PAR_KEYWORDS,
								QUOTE_META_STRING_MODE,
								APOS_META_STRING_MODE
							]
						}]
					}
				]
			},
			hljs.COMMENT(/<!--/, /-->/, { relevance: 10 }),
			{
				begin: /<!\[CDATA\[/,
				end: /\]\]>/,
				relevance: 10
			},
			XML_ENTITIES,
			{
				className: "meta",
				end: /\?>/,
				variants: [{
					begin: /<\?xml/,
					relevance: 10,
					contains: [QUOTE_META_STRING_MODE]
				}, { begin: /<\?[a-z][a-z0-9]+/ }]
			},
			{
				className: "tag",
				begin: /<style(?=\s|>)/,
				end: />/,
				keywords: { name: "style" },
				contains: [TAG_INTERNALS],
				starts: {
					end: /<\/style>/,
					returnEnd: true,
					subLanguage: "css"
				}
			},
			{
				className: "tag",
				begin: /<script(?=\s|>)/,
				end: />/,
				keywords: { name: "script" },
				contains: [TAG_INTERNALS],
				starts: {
					end: /<\/script>/,
					returnEnd: true,
					subLanguage: "javascript"
				}
			},
			{
				className: "tag",
				begin: /<>|<\/>/
			},
			{
				className: "tag",
				begin: regex.concat(/</, regex.lookahead(regex.concat(TAG_NAME_RE, regex.either(/\/>/, />/, /\s/)))),
				end: /\/?>/,
				contains: [{
					className: "name",
					begin: TAG_NAME_RE,
					relevance: 0,
					starts: TAG_INTERNALS
				}]
			},
			{
				className: "tag",
				begin: regex.concat(/<\//, regex.lookahead(regex.concat(TAG_NAME_RE, />/))),
				contains: [{
					className: "name",
					begin: TAG_NAME_RE,
					relevance: 0
				}, {
					begin: />/,
					relevance: 0,
					endsParent: true
				}]
			}
		]
	};
}
var init_xml = __esmMin((() => {}));
//#endregion
//#region routes/_components/CodeBlock.tsx
function SyntaxCode({ code, language = "typescript" }) {
	const highlighted = core_default.highlight(code, { language }).value;
	return /* @__PURE__ */ u$1("code", {
		class: `syntax-highlight language-${language}`,
		dangerouslySetInnerHTML: { __html: highlighted }
	});
}
function CodeBlock({ code, language = "typescript" }) {
	return /* @__PURE__ */ u$1("div", {
		class: "docs-code-block mt-5 overflow-hidden rounded-2xl bg-code",
		children: [/* @__PURE__ */ u$1("div", {
			class: "border-b border-white/10 px-5 py-2.5 text-xs font-semibold tracking-wide text-faint sm:px-6",
			children: languageLabels[language]
		}), /* @__PURE__ */ u$1("pre", {
			class: "overflow-x-auto p-5 text-sm leading-6 text-[#e7f1e4] sm:p-6",
			children: /* @__PURE__ */ u$1(SyntaxCode, {
				code,
				language
			})
		})]
	});
}
var languages, languageLabels;
var init_CodeBlock = __esmMin((() => {
	init_core();
	init_bash();
	init_css();
	init_javascript();
	init_json();
	init_typescript();
	init_xml();
	init_jsxRuntime();
	languages = {
		typescript,
		javascript: javascript$1,
		json,
		bash,
		html: xml,
		css
	};
	for (const [name, definition] of Object.entries(languages)) core_default.registerLanguage(name, definition);
	languageLabels = {
		typescript: "TypeScript",
		javascript: "JavaScript",
		json: "JSON",
		bash: "Shell",
		html: "HTML",
		css: "CSS"
	};
}));
//#endregion
//#region client/factories.ts
var resetOrder;
var init_factories = __esmMin((() => {
	init_events();
	resetOrder = defineFactory("resetOrder", (tickets, giftWrap, defaults) => () => {
		tickets.value = defaults.tickets;
		giftWrap.value = defaults.giftWrap;
	});
}));
//#endregion
//#region routes/_islands/Counter.tsx
var Counter_exports = /* @__PURE__ */ __exportAll({ default: () => __hum_island_default });
var __hum_island_default;
var init_Counter = __esmMin((() => {
	init_signals();
	init_jsxRuntime();
	__hum_island_default = function Counter({ start = 0 }) {
		const count = useSignal(start);
		return /* @__PURE__ */ u$1("div", {
			class: "flex items-center gap-4",
			children: [
				/* @__PURE__ */ u$1("button", {
					class: "grid size-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-xl font-bold transition hover:bg-white/20",
					type: "button",
					onClick: () => count.value--,
					"aria-label": "Decrease count",
					children: "−"
				}),
				/* @__PURE__ */ u$1("output", {
					class: "min-w-10 text-center text-3xl font-extrabold tabular-nums",
					children: count.value
				}),
				/* @__PURE__ */ u$1("button", {
					class: "grid size-11 place-items-center rounded-xl bg-brand text-xl font-bold text-brand-fg transition hover:bg-[#e4fa91]",
					type: "button",
					onClick: () => count.value++,
					"aria-label": "Increase count",
					children: "+"
				})
			]
		});
	};
	if (typeof __hum_island_default === "function" || typeof __hum_island_default === "object" && __hum_island_default !== null) __hum_island_default[Symbol.for("hum.island")] = {
		"name": "local__islands_Counter",
		"file": "routes/_islands/Counter.tsx",
		"exportName": "default"
	};
}));
//#endregion
//#region routes/docs/facets.tsx
var facets_exports = /* @__PURE__ */ __exportAll({
	default: () => ReactivityPage,
	head: () => head$7
});
function ReactivityPage() {
	const tickets = y$1(2);
	const giftWrap = y$1(false);
	return /* @__PURE__ */ u$1("article", { children: [
		/* @__PURE__ */ u$1("h1", {
			class: "text-3xl font-black tracking-tight sm:text-4xl",
			children: "Page-level reactivity"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-5 text-lg leading-8 text-muted",
			children: "Markup that comes alive in the browser without a component behind it is page-level reactivity. The unit is a facet: a signal or a handler bound to a single node of the page’s markup. A signal written as a child or as a prop, or a handler the browser rebuilds to write back to one, is all it takes—the machinery an island uses, applied to a single node."
		}),
		/* @__PURE__ */ u$1("div", {
			onClick: add(tickets, 1),
			children: [/* @__PURE__ */ u$1("label", { children: ["click: ", tickets] }), /* @__PURE__ */ u$1(__hum_island_default, { start: 2 })]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "The same machinery as an island"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: "An island is a marked DOM range, an index into a payload, and a Preact root rendered over that range. A facet is those three pieces with a smaller unit: one text node, or one element with its props and handlers. What you skip is declaring a component, and shipping a client module for it."
		}),
		/* @__PURE__ */ u$1("ul", {
			class: "mt-4 list-disc space-y-2 pl-6 leading-7 text-muted",
			children: [
				/* @__PURE__ */ u$1("li", { children: [
					/* @__PURE__ */ u$1("code", { children: "hum:signal" }),
					" brackets a text node,",
					" ",
					/* @__PURE__ */ u$1("code", { children: "data-hum-signal" }),
					" names the props to rebind, and",
					" ",
					/* @__PURE__ */ u$1("code", { children: "data-hum-handler" }),
					" the handlers. All three carry payload indexes, exactly like ",
					/* @__PURE__ */ u$1("code", { children: "hum:island" }),
					", and the payload is embedded only when the page has something to revive."
				] }),
				/* @__PURE__ */ u$1("li", { children: [
					"Hydration is scheduled for both, so nothing is live until the task after ",
					/* @__PURE__ */ u$1("code", { children: "boot" }),
					" returns."
				] }),
				/* @__PURE__ */ u$1("li", { children: "What a facet cannot do is hold state. An island owns a component instance, which survives its region being re-rendered, while a page-level signal is revived from the payload of each response. Component state, hooks, or a value that has to stay live on the client are still island work." })
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Bind a signal"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"As a child it renders its value on the server and stays a live text node; as a prop the matching DOM property follows the signal afterwards. Booleans work the same way, so a checkbox or a ",
				/* @__PURE__ */ u$1("code", { children: "details" }),
				" ",
				"element reflects its signal by itself."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: checkoutExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-4 leading-7 text-muted",
			children: [
				"One ",
				/* @__PURE__ */ u$1("code", { children: "tickets" }),
				" ",
				"signal is behind the text, the field and both buttons, so a change from any of them updates the others. Creating it with the view is on purpose: the server renders its value into that response—so it may come from the request—and the client revives its own copy. Inside an island, where renders repeat, use ",
				/* @__PURE__ */ u$1("code", { children: "useSignal" }),
				" instead."
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Handlers come from factories"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"A handler is rebuilt in the browser, so it travels as a factory name plus the arguments it was called with—a closure cannot be serialized and throws at render time. ",
				/* @__PURE__ */ u$1("code", { children: "@humjs/core/events" }),
				" ships",
				" ",
				/* @__PURE__ */ u$1("code", { children: "add(signal, delta, options)" }),
				", ",
				/* @__PURE__ */ u$1("code", { children: "setValue" }),
				",",
				" ",
				/* @__PURE__ */ u$1("code", { children: "toggle" }),
				" and ",
				/* @__PURE__ */ u$1("code", { children: "setFromProp(signal, key)" }),
				"; a handler of your own is a factory too."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: customFactoryExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-4 leading-7 text-muted",
			children: [
				"The ",
				/* @__PURE__ */ u$1("em", { children: "name" }),
				" is what travels to the client, so keep it unique and stable, and import the module that defines the factory from the client entry or from an island—otherwise the browser has nothing to rebuild it with and the page throws",
				" ",
				/* @__PURE__ */ u$1("code", { children: "Hum: the handler factory … is not registered on the client" }),
				"."
			]
		}),
		/* @__PURE__ */ u$1("section", {
			class: "mt-12 rounded-3xl border border-line bg-surface p-6 sm:p-8",
			children: [
				/* @__PURE__ */ u$1("p", {
					class: "text-sm font-bold uppercase tracking-[0.16em] text-accent",
					children: "Try it"
				}),
				/* @__PURE__ */ u$1("h2", {
					class: "mt-2 text-lg font-extrabold",
					children: "A checkout made of facets"
				}),
				/* @__PURE__ */ u$1("p", {
					class: "mt-2 leading-7 text-muted",
					children: "Every control below is a facet on this page’s own markup. The quantity and the gift-wrap flag are signals; the controls call handlers that the browser rebuilt from the payload, including the custom factory behind Reset."
				}),
				/* @__PURE__ */ u$1("div", {
					class: "mt-6 flex flex-wrap items-center gap-6",
					children: [
						/* @__PURE__ */ u$1("div", {
							class: "flex items-center gap-3",
							children: [
								/* @__PURE__ */ u$1("button", {
									type: "button",
									"aria-label": "Remove one ticket",
									onClick: add(tickets, -1, {
										min: 1,
										max: MAX_TICKETS
									}),
									class: "grid size-11 place-items-center rounded-xl border border-line text-xl font-bold transition hover:bg-surface-2",
									children: "−"
								}),
								/* @__PURE__ */ u$1("output", {
									class: "min-w-12 text-center text-3xl font-extrabold tabular-nums",
									children: tickets
								}),
								/* @__PURE__ */ u$1("button", {
									type: "button",
									"aria-label": "Add one ticket",
									onClick: add(tickets, 1, {
										min: 1,
										max: MAX_TICKETS
									}),
									class: "grid size-11 place-items-center rounded-xl bg-brand text-xl font-bold text-brand-fg transition hover:bg-[#e4fa91]",
									children: "+"
								})
							]
						}),
						/* @__PURE__ */ u$1("label", {
							class: "flex items-center gap-2 text-sm font-semibold text-fg-soft",
							children: ["Tickets", /* @__PURE__ */ u$1("input", {
								type: "number",
								min: "1",
								max: MAX_TICKETS,
								value: tickets,
								onInput: setFromProp(tickets, "value"),
								class: "w-24 rounded-xl border border-line bg-bg px-3 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
							})]
						}),
						/* @__PURE__ */ u$1("label", {
							class: "flex items-center gap-2 text-sm font-semibold text-fg-soft",
							children: [/* @__PURE__ */ u$1("input", {
								type: "checkbox",
								checked: giftWrap,
								onChange: setFromProp(giftWrap, "checked"),
								class: "size-5 accent-[#7fae3a]"
							}), "Gift wrap"]
						}),
						/* @__PURE__ */ u$1("button", {
							type: "button",
							onClick: resetOrder(tickets, giftWrap, {
								tickets: 2,
								giftWrap: false
							}),
							class: "rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg-soft transition hover:bg-surface-2",
							children: "Reset"
						})
					]
				})
			]
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-12 border-t border-line pt-6 text-sm text-muted",
			children: [
				"Previous:",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/partials",
					children: "Partial page updates →"
				})
			]
		})
	] });
}
var head$7, MAX_TICKETS, checkoutExample, customFactoryExample;
var init_facets = __esmMin((() => {
	init_signals();
	init_events();
	init_dist();
	init_CodeBlock();
	init_factories();
	init_Counter();
	init_jsxRuntime();
	head$7 = define.head(/* @__PURE__ */ u$1("title", { children: "Page-level reactivity — Hum Guides" }));
	MAX_TICKETS = 8;
	checkoutExample = `import { signal } from "@preact/signals";
import { add, setFromProp } from "@humjs/core/events";

export default function Checkout() {
  const tickets = signal(2);

  return (
    <form>
      <button type="button" onClick={add(tickets, -1, { min: 1, max: 8 })}>−</button>
      <output>{tickets}</output>
      <button type="button" onClick={add(tickets, 1, { min: 1, max: 8 })}>+</button>

      <input
        type="number"
        value={tickets}
        onInput={setFromProp(tickets, "value")}
      />
    </form>
  );
}`;
	customFactoryExample = `// client/factories.ts — imported by client/main.ts as well
import { defineFactory } from "@humjs/core/events";
import type { Signal } from "@preact/signals";

/** Resets both options at once; each built-in factory drives one signal. */
export const resetOrder = defineFactory(
  "resetOrder",
  (
    tickets: Signal<number>,
    giftWrap: Signal<boolean>,
    defaults: { tickets: number; giftWrap: boolean },
  ) =>
    () => {
      tickets.value = defaults.tickets;
      giftWrap.value = defaults.giftWrap;
    },
);`;
}));
//#endregion
//#region routes/docs/getting-started.tsx
var getting_started_exports = /* @__PURE__ */ __exportAll({
	default: () => GettingStarted,
	head: () => head$6
});
function GettingStarted(_props) {
	return /* @__PURE__ */ u$1("article", { children: [
		/* @__PURE__ */ u$1("h1", {
			class: "text-3xl font-black tracking-tight sm:text-4xl",
			children: "Getting started"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-5 text-lg leading-8 text-muted",
			children: "Create a Hum app, start it locally, and make your first change. The default template is a Node.js app built with Vite, Preact, and Hono."
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Create and run the app"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: "Use Node.js 20 or later. The scaffold uses npm by default; pnpm and other package managers work too."
		}),
		/* @__PURE__ */ u$1(CodeBlock, {
			code: installExample,
			language: "bash"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Open the local URL printed by Vite. The starter page is in",
				" ",
				/* @__PURE__ */ u$1("code", { children: "routes/index.tsx" }),
				"; edit its title or markup and save to see the change with HMR."
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Add an island"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Pages render to HTML on the server. To add browser-side component state or event handlers, put a component in ",
				/* @__PURE__ */ u$1("code", { children: "islands/" }),
				" and import it into a route. The generated template already includes",
				" ",
				/* @__PURE__ */ u$1("code", { children: "islands/Counter.tsx" }),
				":"
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, {
			code: pageExample,
			language: "typescript"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Only the island is hydrated in the browser; the rest of the page remains server-rendered HTML. For an interaction that does not need component state, see the",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/facets",
					children: "page-level reactivity guide"
				}),
				"."
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Build and serve"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"The basic template bundles the server app and client assets into",
				" ",
				/* @__PURE__ */ u$1("code", { children: "dist/" }),
				". Build and run the Node server with:"
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, {
			code: buildExample,
			language: "bash"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"The server listens on port ",
				/* @__PURE__ */ u$1("code", { children: "3000" }),
				" by default; set",
				" ",
				/* @__PURE__ */ u$1("code", { children: "PORT" }),
				" to change it. The",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/hono",
					children: "Hono and deployment guide"
				}),
				" ",
				"explains the server entry, API routes, static files, and the Cloudflare template."
			]
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-12 border-t border-line pt-6 text-sm text-muted",
			children: [
				"Next:",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/routing",
					children: "Routing and rendering →"
				})
			]
		})
	] });
}
var head$6, installExample, pageExample, buildExample;
var init_getting_started = __esmMin((() => {
	init_dist();
	init_CodeBlock();
	init_jsxRuntime();
	head$6 = define.head(/* @__PURE__ */ u$1("title", { children: "Getting started — Hum Guides" }));
	installExample = `npm create hum@latest my-app
cd my-app
npm install
npm run dev`;
	pageExample = `// routes/index.tsx
import Counter from "../islands/Counter.js";

export default function Home() {
  return (
    <main>
      <h1>Welcome to my app</h1>
      <p>This page is rendered as HTML on the server.</p>
      <Counter start={0} />
    </main>
  );
}`;
	buildExample = `npm run build
npm start`;
}));
//#endregion
//#region routes/docs/handlers.tsx
var handlers_exports = /* @__PURE__ */ __exportAll({
	default: () => handlers_default,
	handlers: () => handlers$2,
	head: () => head$5
});
var head$5, handlers$2, handlerExample, directResponseExample, handlers_default;
var init_handlers = __esmMin((() => {
	init_dist();
	init_shared();
	init_CodeBlock();
	init_jsxRuntime();
	head$5 = define.head(/* @__PURE__ */ u$1("title", { children: "Route handlers — Hum Guides" }));
	handlers$2 = define.handlers({
		GET: () => page({ notice: "" }),
		POST: async (c) => {
			const form = await c.req.formData();
			const name = String(form.get("name") ?? "").trim();
			return page({ notice: name ? `Welcome, ${name}!` : "Please enter a name." });
		}
	});
	handlerExample = `// The code behind the form at the bottom of this page.
import { define, page } from "@humjs/core";
import { Partial } from "@humjs/core/shared";

export const handlers = define.handlers({
  GET: () => page({ notice: "" }),
  POST: async (c) => {
    const form = await c.req.formData();
    const name = String(form.get("name") ?? "").trim();
    return page({
      notice: name ? \`Welcome, \${name}!\` : "Please enter a name.",
    });
  },
});

export default define.page<{ notice: string }>(({ data }) => (
  <form method="post" action="/docs/handlers" data-hum-client-nav>
    <input name="name" required />
    <Partial name="welcome">
      {data.notice && <p>{data.notice}</p>}
    </Partial>
  </form>
));`;
	directResponseExample = `// server.ts of this site, reachable at /api/health
app.get("/api/health", (c) => c.json({ status: "ok" }));`;
	handlers_default = define.page(({ data }) => {
		return /* @__PURE__ */ u$1("article", { children: [
			/* @__PURE__ */ u$1("h1", {
				class: "text-3xl font-black tracking-tight sm:text-4xl",
				children: "Route handlers"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-5 text-lg leading-8 text-muted",
				children: "Handle a request with Hono’s context, then either return a response directly or render this route’s page with data."
			}),
			/* @__PURE__ */ u$1("h2", {
				class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
				children: "Load data and render the page"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-3 leading-7 text-muted",
				children: [
					"Export a",
					" ",
					/* @__PURE__ */ u$1("code", {
						class: "rounded bg-surface px-1.5 py-0.5 text-sm",
						children: "handlers"
					}),
					" ",
					"object keyed by HTTP method. Import",
					" ",
					/* @__PURE__ */ u$1("code", {
						class: "rounded bg-surface px-1.5 py-0.5 text-sm",
						children: "page"
					}),
					" from",
					" ",
					/* @__PURE__ */ u$1("code", {
						class: "rounded bg-surface px-1.5 py-0.5 text-sm",
						children: "@humjs/core"
					}),
					" ",
					"to render the same file’s default component. The handler receives the unmodified Hono context."
				]
			}),
			/* @__PURE__ */ u$1(CodeBlock, {
				code: handlerExample,
				language: "typescript"
			}),
			/* @__PURE__ */ u$1("ul", {
				class: "mt-4 list-disc space-y-2 pl-6 leading-7 text-muted",
				children: [
					/* @__PURE__ */ u$1("li", { children: [
						"The first argument becomes the view’s ",
						/* @__PURE__ */ u$1("code", { children: "data" }),
						" prop."
					] }),
					/* @__PURE__ */ u$1("li", { children: [
						"Pass ",
						/* @__PURE__ */ u$1("code", { children: `{ status: 201 }` }),
						" ",
						"as the second argument to set the HTML response status."
					] }),
					/* @__PURE__ */ u$1("li", { children: [
						"A ",
						/* @__PURE__ */ u$1("code", { children: "HEAD" }),
						" request uses the ",
						/* @__PURE__ */ u$1("code", { children: "HEAD" }),
						" ",
						"handler, or falls back to ",
						/* @__PURE__ */ u$1("code", { children: "GET" }),
						" when one is not defined."
					] })
				]
			}),
			/* @__PURE__ */ u$1("h2", {
				class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
				children: "Return a response directly"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-3 leading-7 text-muted",
				children: [
					"Handlers can use Hono helpers such as ",
					/* @__PURE__ */ u$1("code", { children: "c.json()" }),
					",",
					" ",
					/* @__PURE__ */ u$1("code", { children: "c.text()" }),
					", and",
					" ",
					/* @__PURE__ */ u$1("code", { children: "c.redirect()" }),
					". If a handler returns a",
					" ",
					/* @__PURE__ */ u$1("code", { children: "Response" }),
					", Hum sends it without rendering the page."
				]
			}),
			/* @__PURE__ */ u$1(CodeBlock, {
				code: directResponseExample,
				language: "typescript"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-4 leading-7 text-muted",
				children: [
					"That endpoint is live on this site:",
					" ",
					/* @__PURE__ */ u$1("a", {
						class: "font-semibold text-accent hover:underline",
						href: "/api/health",
						children: "/api/health →"
					})
				]
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-4 leading-7 text-muted",
				children: [
					"If the selected handler returns nothing, Hum falls through to the default page render. If a route declares handlers but does not handle a non-GET/HEAD method, Hum responds with",
					" ",
					/* @__PURE__ */ u$1("code", { children: "405 Method Not Allowed" }),
					"."
				]
			}),
			/* @__PURE__ */ u$1("section", {
				class: "mt-12 rounded-3xl border border-line bg-surface p-6 sm:p-8",
				children: [
					/* @__PURE__ */ u$1("p", {
						class: "text-sm font-bold uppercase tracking-[0.16em] text-accent",
						children: "Try it"
					}),
					/* @__PURE__ */ u$1("h2", {
						class: "mt-2 text-lg font-extrabold",
						children: "A form handled on the server"
					}),
					/* @__PURE__ */ u$1("p", {
						class: "mt-2 leading-7 text-muted",
						children: [
							"This form submits to the page’s ",
							/* @__PURE__ */ u$1("code", { children: "POST" }),
							" ",
							"handler. The handler reads the form data and renders the page again with a message."
						]
					}),
					/* @__PURE__ */ u$1("form", {
						"data-hum-client-nav": true,
						method: "post",
						action: "/docs/handlers",
						class: "mt-5 flex flex-col gap-3 sm:flex-row",
						children: [
							/* @__PURE__ */ u$1("label", {
								class: "sr-only",
								for: "handler-name",
								children: "Your name"
							}),
							/* @__PURE__ */ u$1("input", {
								id: "handler-name",
								name: "name",
								required: true,
								placeholder: "Your name",
								class: "min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
							}),
							/* @__PURE__ */ u$1("button", {
								type: "submit",
								class: "rounded-xl bg-fg px-5 py-3 font-bold text-bg transition hover:bg-fg-hover",
								children: "Send request"
							})
						]
					}),
					/* @__PURE__ */ u$1(Partial, {
						name: "welcome",
						children: data.notice && /* @__PURE__ */ u$1("p", {
							class: "mt-4 rounded-xl bg-accent-bg px-4 py-3 font-semibold text-accent-strong",
							children: data.notice
						})
					})
				]
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-12 border-t border-line pt-6 text-sm text-muted",
				children: [
					"Next:",
					" ",
					/* @__PURE__ */ u$1("a", {
						class: "font-semibold text-accent hover:underline",
						href: "/docs/partials",
						children: "Partial page updates →"
					})
				]
			})
		] });
	});
}));
//#endregion
//#region routes/docs/hono.tsx
var hono_exports = /* @__PURE__ */ __exportAll({
	default: () => HonoGuide,
	head: () => head$4
});
function HonoGuide(_props) {
	return /* @__PURE__ */ u$1("article", { children: [
		/* @__PURE__ */ u$1("h1", {
			class: "text-3xl font-black tracking-tight sm:text-4xl",
			children: "Hono and Hum middleware"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-5 text-lg leading-8 text-muted",
			children: [
				"Hum mounts its file routes onto the Hono app exported by",
				" ",
				/* @__PURE__ */ u$1("code", { children: "server.ts" }),
				". Both middleware systems run in the same request pipeline, but their scopes are different."
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Hono middleware: app and URL scope"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Register Hono middleware on the app before Hum is mounted. It runs for matching Hono API routes and Hum requests; a path pattern lets you select which requests it wraps. For example, app-wide middleware can provide shared headers or logging, while an API prefix can be protected independently of pages. This is that file for this site—every response you have loaded carries its ",
				/* @__PURE__ */ u$1("code", { children: "x-powered-by" }),
				" ",
				"header, including the",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/api/health",
					children: "/api/health"
				}),
				" ",
				"endpoint it also declares."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: honoMiddlewareExample }),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Hum middleware: a directory-scoped mount point"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"A Hum ",
				/* @__PURE__ */ u$1("code", { children: "_middleware.ts" }),
				" ",
				"is a mount point for a Hono middleware, scoped by the directory it lives in: it applies to Hum file routes in that directory and descendants. Parent middleware is inherited, and the chain runs from the routes root toward the matched route. It also wraps that route’s handlers and the",
				" ",
				/* @__PURE__ */ u$1("code", { children: "_404" }),
				" ",
				"render for unmatched paths under the same directory, but it does not apply to Hono API routes declared in ",
				/* @__PURE__ */ u$1("code", { children: "server.ts" }),
				"."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: humMiddlewareExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-4 leading-7 text-muted",
			children: [
				"This site has none, so the difference is easy to see: the header above is added by Hono middleware and appears on every response, while a",
				" ",
				/* @__PURE__ */ u$1("code", { children: "_middleware.ts" }),
				" in ",
				/* @__PURE__ */ u$1("code", { children: "routes/docs/" }),
				" would only run for the guide pages below it—never for ",
				/* @__PURE__ */ u$1("code", { children: "/api/health" }),
				"."
			]
		}),
		/* @__PURE__ */ u$1("div", {
			class: "mt-6 rounded-2xl border border-line bg-surface-2 p-5 leading-7 text-muted",
			children: [
				"Reach for ",
				/* @__PURE__ */ u$1("code", { children: "app.use()" }),
				" in ",
				/* @__PURE__ */ u$1("code", { children: "server.ts" }),
				" first: it is the general alternative and covers both Hum pages and Hono API routes by path pattern. Use ",
				/* @__PURE__ */ u$1("code", { children: "_middleware.ts" }),
				" ",
				"only when the policy belongs to a branch of Hum’s route tree—for example a URL-transparent ",
				/* @__PURE__ */ u$1("code", { children: "(group)/" }),
				" directory, which a path pattern cannot express. A request matching both passes through Hono middleware first, then the Hum route middleware. Either can short-circuit by returning a ",
				/* @__PURE__ */ u$1("code", { children: "Response" }),
				"."
			]
		})
	] });
}
var head$4, honoMiddlewareExample, humMiddlewareExample;
var init_hono = __esmMin((() => {
	init_dist();
	init_CodeBlock();
	init_jsxRuntime();
	head$4 = define.head(/* @__PURE__ */ u$1("title", { children: "Hono and Hum middleware — Hum Guides" }));
	honoMiddlewareExample = `// server.ts — the Hono app this documentation runs on
import { Hono } from "hono";

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;`;
	humMiddlewareExample = `// routes/admin/_middleware.ts
import { define } from "@humjs/core";

// The default export is a Hono middleware. The directory this file lives in
// decides which Hum routes it wraps.
export default define.middleware(async (c, next) => {
  if (!(await isSignedIn(c))) return c.redirect("/login");
  await next();
});`;
}));
//#endregion
//#region routes/docs/partials/[[topic]].tsx
var __topic___exports = /* @__PURE__ */ __exportAll({
	default: () => PartialsPage,
	handlers: () => handlers$1,
	head: () => head$3
});
function PartialsPage({ url, data }) {
	const batch = data.batch;
	const hasMore = data.hasMore ?? true;
	const topic = url.searchParams.get("topic") ?? "start";
	const initialItems = LOAD_MORE_ITEMS.slice(0, LOAD_MORE_BATCH_SIZE);
	const appendedItems = batch === void 0 ? [] : LOAD_MORE_ITEMS.slice(batch * LOAD_MORE_BATCH_SIZE, (batch + 1) * LOAD_MORE_BATCH_SIZE);
	return /* @__PURE__ */ u$1("article", { children: [
		/* @__PURE__ */ u$1("h1", {
			class: "text-3xl font-black tracking-tight sm:text-4xl",
			children: "Partial page updates"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-5 text-lg leading-8 text-muted",
			children: "Use partials to fetch a new page while replacing, appending, or prepending only named regions of the current document."
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Mark a region and opt in to client navigation"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Wrap the content to update in a ",
				/* @__PURE__ */ u$1("code", { children: "Partial" }),
				" ",
				"with a stable, unique name. Add",
				" ",
				/* @__PURE__ */ u$1("strong", {
					class: "font-bold",
					children: "data-hum-client-nav"
				}),
				" ",
				"to an ancestor to intercept same-origin links and GET/POST forms inside it. Matching partials from the fetched page are applied without replacing the surrounding shell."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: partialExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-4 leading-7 text-muted",
			children: "Keep the partial name consistent between responses. A normal full-page navigation still works when client navigation is not enabled."
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Links and forms"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Links inside an opted-in region navigate without a full reload. GET and POST forms are also supported; other form methods use normal browser submission. Add ",
				/* @__PURE__ */ u$1("code", { children: "data-hum-partial" }),
				" ",
				"to a link or form when you want to fetch a different URL than the one used for the visible navigation or form action."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: linkExample }),
		/* @__PURE__ */ u$1("div", {
			class: "mt-5 rounded-2xl border border-line bg-surface-2 p-5 leading-7 text-muted",
			children: [
				"For a smaller opt-in area, put",
				" ",
				/* @__PURE__ */ u$1("strong", {
					class: "font-bold",
					children: "data-hum-client-nav"
				}),
				" ",
				"only on the wrapper containing the links/forms that should use partial navigation. Set ",
				/* @__PURE__ */ u$1("code", { children: ["data-hum-client-nav=", "{false}"] }),
				" ",
				"to opt out inside an enabled ancestor."
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "View Transitions"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: "Hum automatically uses the browser’s View Transitions API for client-side partial navigations when it is available. The transition covers the partial DOM updates and current-link state; no extra attribute or JavaScript setup is needed. Browsers without the API apply the updates normally. You can customize the animation with the standard View Transition pseudo-elements, for example:"
		}),
		/* @__PURE__ */ u$1(CodeBlock, {
			code: viewTransitionExample,
			language: "css"
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Choose how new content is applied"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: "The default mode replaces the region’s contents. Use append or prepend for feeds and lists; the existing DOM children are retained and new content is added at the selected edge. The second demo below does both: the list region appends the next batch while the region holding the form is replaced, so the button can move from “Load more” to the end of the list."
		}),
		/* @__PURE__ */ u$1("div", {
			class: "mt-5 grid gap-3 sm:grid-cols-3",
			children: [
				/* @__PURE__ */ u$1(ModeCard, {
					mode: "replace",
					description: "Replace the current region contents (default)."
				}),
				/* @__PURE__ */ u$1(ModeCard, {
					mode: "append",
					description: "Add the fetched content after existing children."
				}),
				/* @__PURE__ */ u$1(ModeCard, {
					mode: "prepend",
					description: "Add the fetched content before existing children."
				})
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: loadMoreExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-4 leading-7 text-muted",
			children: "If a response does not contain any partial regions, Hum falls back to a full navigation. The URL and browser history stay in sync, and Back / Forward restores the prior page state."
		}),
		/* @__PURE__ */ u$1("section", {
			class: "mt-12 rounded-3xl border border-line bg-surface p-6 sm:p-8",
			children: [
				/* @__PURE__ */ u$1("p", {
					class: "text-sm font-bold uppercase tracking-[0.16em] text-accent",
					children: "Try it"
				}),
				/* @__PURE__ */ u$1("h2", {
					class: "mt-2 text-lg font-extrabold",
					children: "Update one region"
				}),
				/* @__PURE__ */ u$1("p", {
					class: "mt-2 leading-7 text-muted",
					children: "These links change the URL and replace only the matching partial. The surrounding panel stays in place."
				}),
				/* @__PURE__ */ u$1("div", {
					class: "mt-5",
					children: [/* @__PURE__ */ u$1("nav", {
						"data-hum-client-nav": true,
						"aria-label": "Choose a topic",
						class: "flex flex-wrap gap-2",
						children: [
							/* @__PURE__ */ u$1(TopicLink, {
								topic: "start",
								label: "Start"
							}),
							/* @__PURE__ */ u$1(TopicLink, {
								topic: "handlers",
								label: "Handlers"
							}),
							/* @__PURE__ */ u$1(TopicLink, {
								topic: "islands",
								label: "Islands"
							}),
							/* @__PURE__ */ u$1(TopicLink, {
								topic: "routing",
								label: "Routing"
							})
						]
					}), batch === void 0 ? /* @__PURE__ */ u$1(Partial, {
						name: "topic",
						children: /* @__PURE__ */ u$1("div", {
							class: "mt-4 min-h-24 rounded-2xl bg-surface-2 p-5",
							children: [/* @__PURE__ */ u$1("p", {
								class: "text-xs font-bold uppercase tracking-[0.16em] text-accent",
								children: "Current topic"
							}), /* @__PURE__ */ u$1("p", {
								class: "mt-2 font-semibold text-fg-soft",
								children: topics[topic] ?? "That topic is not available."
							})]
						})
					}) : null]
				})
			]
		}),
		/* @__PURE__ */ u$1("section", {
			class: "mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8",
			children: [
				/* @__PURE__ */ u$1("p", {
					class: "text-sm font-bold uppercase tracking-[0.16em] text-accent",
					children: "Append mode demo"
				}),
				/* @__PURE__ */ u$1("h2", {
					class: "mt-2 text-lg font-extrabold",
					children: "Load more items"
				}),
				/* @__PURE__ */ u$1("p", {
					class: "mt-2 leading-7 text-muted",
					children: "Submit the form to fetch the next two items. The list appends them; only the form area is replaced."
				}),
				/* @__PURE__ */ u$1("div", {
					"data-hum-client-nav": true,
					class: "mt-5",
					children: [/* @__PURE__ */ u$1("ol", {
						class: "space-y-3",
						children: /* @__PURE__ */ u$1(Partial, {
							name: "load-more-items",
							mode: batch === void 0 ? "replace" : "append",
							children: (batch === void 0 ? initialItems : appendedItems).map((item, index) => {
								const itemNumber = (batch ?? 0) * LOAD_MORE_BATCH_SIZE + index + 1;
								return /* @__PURE__ */ u$1("li", {
									class: "flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-fg-soft",
									children: [/* @__PURE__ */ u$1("span", {
										class: "grid size-7 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-accent",
										children: itemNumber
									}), item]
								}, itemNumber);
							})
						})
					}), /* @__PURE__ */ u$1(Partial, {
						name: "load-more-control",
						children: /* @__PURE__ */ u$1("div", {
							class: "mt-4",
							children: hasMore ? /* @__PURE__ */ u$1("form", {
								method: "post",
								action: "/docs/partials",
								children: [/* @__PURE__ */ u$1("input", {
									type: "hidden",
									name: "batch",
									value: batch === void 0 ? 1 : batch + 1
								}), /* @__PURE__ */ u$1("button", {
									type: "submit",
									class: "rounded-xl bg-code px-5 py-3 text-sm font-bold text-white transition hover:bg-fg-hover",
									children: "Load more"
								})]
							}) : /* @__PURE__ */ u$1("p", {
								class: "rounded-xl bg-accent-bg px-4 py-3 text-sm font-semibold text-accent-strong",
								children: "You’ve reached the end of the list."
							})
						})
					})]
				})
			]
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-12 border-t border-line pt-6 text-sm text-muted",
			children: [
				"Previous:",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/handlers",
					children: "Route handlers →"
				})
			]
		})
	] });
}
function TopicLink({ topic, label }) {
	return /* @__PURE__ */ u$1("a", {
		href: `/docs/partials/${topic}`,
		"data-hum-partial": `/docs/partials?topic=${topic}`,
		class: "rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:bg-surface hover:text-accent-strong aria-[current]:text-accent-strong aria-[current]:border-accent aria-[current]:bg-surface",
		children: label
	});
}
function ModeCard({ mode, description }) {
	return /* @__PURE__ */ u$1("div", {
		class: "rounded-2xl border border-line bg-surface p-4",
		children: [/* @__PURE__ */ u$1("code", {
			class: "font-bold text-accent",
			children: mode
		}), /* @__PURE__ */ u$1("p", {
			class: "mt-2 text-sm leading-6 text-muted",
			children: description
		})]
	});
}
var head$3, LOAD_MORE_ITEMS, LOAD_MORE_BATCH_SIZE, handlers$1, partialExample, linkExample, viewTransitionExample, loadMoreExample, topics;
var init___topic__ = __esmMin((() => {
	init_dist();
	init_shared();
	init_CodeBlock();
	init_jsxRuntime();
	head$3 = define.head(/* @__PURE__ */ u$1("title", { children: "Partial page updates — Hum Guides" }));
	LOAD_MORE_ITEMS = [
		"Append new content without replacing what is already on screen.",
		"Keep the request and rendering on the server.",
		"Update the load-more control independently from the list.",
		"Stop offering more items when the collection is complete.",
		"No client-side island is needed for this interaction.",
		"The growing list remains ordinary HTML."
	];
	LOAD_MORE_BATCH_SIZE = 2;
	handlers$1 = define.handlers({
		GET: () => page({ hasMore: true }),
		POST: async (c) => {
			const form = await c.req.formData();
			const batch = Number(form.get("batch"));
			if (!Number.isInteger(batch) || batch < 1) return c.text("Invalid batch number.", 400);
			const start = batch * LOAD_MORE_BATCH_SIZE;
			return page({
				batch,
				hasMore: start + LOAD_MORE_BATCH_SIZE < LOAD_MORE_ITEMS.length
			});
		}
	});
	partialExample = `// routes/docs/partials/[[topic]].tsx — the first demo on this page
import { Partial } from "@humjs/core/shared";

export default function PartialsPage({ url }) {
  const topic = url.searchParams.get("topic") ?? "start";

  return (
    <div data-hum-client-nav>
      <a href="/docs/partials/handlers" data-hum-partial="/docs/partials?topic=handlers">
        Handlers
      </a>

      <Partial name="topic">
        <p>{topics[topic]}</p>
      </Partial>
    </div>
  );
}`;
	linkExample = `// the link navigates to /docs/partials/handlers, but the fetch
// that updates the "topic" region asks for /docs/partials?topic=handlers
<a href="/docs/partials/handlers" data-hum-partial="/docs/partials?topic=handlers">
  Handlers
</a>`;
	viewTransitionExample = `::view-transition-old(root) {
  animation: 180ms ease-out both fade-out;
}

::view-transition-new(root) {
  animation: 180ms ease-out both fade-in;
}

@keyframes fade-out {
  to { opacity: 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(root),
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 0s;
  }
}`;
	loadMoreExample = `// handlers: what the "Load more" form below submits to
export const handlers = define.handlers({
  GET: () => page({ hasMore: true }),
  POST: async (c) => {
    const form = await c.req.formData();
    const batch = Number(form.get("batch"));
    const start = batch * LOAD_MORE_BATCH_SIZE;

    return page({
      batch,
      hasMore: start + LOAD_MORE_BATCH_SIZE < LOAD_MORE_ITEMS.length,
    });
  },
});

// one region appends the new items, the other replaces the form
<div data-hum-client-nav>
  <Partial name="load-more-items" mode={batch === undefined ? "replace" : "append"}>
    {itemsForBatch.map((item) => <li>{item}</li>)}
  </Partial>

  <Partial name="load-more-control">
    <form method="post" action="/docs/partials">
      <input type="hidden" name="batch" value={nextBatch} />
      <button>Load more</button>
    </form>
  </Partial>
</div>`;
	topics = {
		start: "Pick a topic to update just this panel.",
		handlers: "Handlers let a route answer HTTP requests or load data for its page.",
		islands: "Islands hydrate interactive components while the rest stays HTML.",
		routing: "File-based routes turn your routes directory into URLs."
	};
}));
//#endregion
//#region routes/docs/routing.tsx
var routing_exports = /* @__PURE__ */ __exportAll({
	default: () => RoutingGuide,
	head: () => head$2
});
function RoutingGuide(_props) {
	return /* @__PURE__ */ u$1("article", { children: [
		/* @__PURE__ */ u$1("h1", {
			class: "text-3xl font-black tracking-tight sm:text-4xl",
			children: "Routing and rendering"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-5 text-lg leading-8 text-muted",
			children: "Hum discovers routes from files. Special files add document shells, layouts, middleware, error pages, and not-found pages to the route tree."
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Route files"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Route files become URLs from their relative paths. This is the tree of the site you are reading: the guide pages come from",
				" ",
				/* @__PURE__ */ u$1("code", { children: "docs/" }),
				", and the page you are on now is the optional segment",
				" ",
				/* @__PURE__ */ u$1("code", { children: "docs/partials/[[topic]].tsx" }),
				". Parenthesized directories are transparent groups; bracket syntax marks dynamic, optional, and catch-all segments."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, {
			code: routeTreeExample,
			language: "bash"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Files in a route directory normally become routes. Put reusable view components in a nearby ",
				/* @__PURE__ */ u$1("code", { children: "_components/" }),
				" ",
				"directory to keep them out of route discovery while still importing them with a relative path, for example",
				" ",
				/* @__PURE__ */ u$1("code", { children: "import Author from \"./_components/Author.js\"" }),
				"."
			]
		}),
		/* @__PURE__ */ u$1("ul", {
			class: "mt-4 list-disc space-y-2 pl-6 leading-7 text-muted",
			children: [
				/* @__PURE__ */ u$1("li", { children: [/* @__PURE__ */ u$1("code", { children: "[id].tsx" }), " matches one dynamic path segment."] }),
				/* @__PURE__ */ u$1("li", { children: [/* @__PURE__ */ u$1("code", { children: "[[lang]].tsx" }), " is an optional single segment."] }),
				/* @__PURE__ */ u$1("li", { children: [/* @__PURE__ */ u$1("code", { children: "[...slug].tsx" }), " matches zero or more remaining segments."] }),
				/* @__PURE__ */ u$1("li", { children: "Static routes take precedence over dynamic matches." })
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "Layouts and special files"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				/* @__PURE__ */ u$1("code", { children: "_app.tsx" }),
				" provides the outer document,",
				/* @__PURE__ */ u$1("code", { children: "_layout.tsx" }),
				" wraps routes in its directory,",
				/* @__PURE__ */ u$1("code", { children: "_middleware.ts" }),
				" mounts Hono middleware for routes below it,",
				/* @__PURE__ */ u$1("code", { children: "_error.tsx" }),
				" renders route errors, and",
				/* @__PURE__ */ u$1("code", { children: "_404.tsx" }),
				" ",
				"handles unmatched paths in its directory subtree. More-specific layouts, middleware, and error/not-found pages apply within their route branch."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: middlewareExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-4 leading-7 text-muted",
			children: [
				"Guarding an admin branch is the usual reason to add one, because the directory the file lives in is its scope. For app-wide or URL-prefix policy use ",
				/* @__PURE__ */ u$1("code", { children: "app.use()" }),
				" in ",
				/* @__PURE__ */ u$1("code", { children: "server.ts" }),
				" instead—the general alternative. This site has no ",
				/* @__PURE__ */ u$1("code", { children: "_middleware.ts" }),
				"; the middleware it does run is Hono middleware in ",
				/* @__PURE__ */ u$1("code", { children: "server.ts" }),
				", covered in the",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/hono",
					children: "next guide"
				}),
				"."
			]
		}),
		/* @__PURE__ */ u$1("h2", {
			class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
			children: "HTML first, islands by choice"
		}),
		/* @__PURE__ */ u$1("p", {
			class: "mt-3 leading-7 text-muted",
			children: [
				"Pages and components render to HTML on the server. A component becomes interactive when it is discovered under ",
				/* @__PURE__ */ u$1("code", { children: "islands/" }),
				" ",
				"or a route-local ",
				/* @__PURE__ */ u$1("code", { children: "_islands/" }),
				" ",
				"directory and used by a page; only those island bundles hydrate in the browser. Route-local islands are useful for interactive components only used by one route branch."
			]
		}),
		/* @__PURE__ */ u$1(CodeBlock, { code: islandExample }),
		/* @__PURE__ */ u$1("p", {
			class: "mt-12 border-t border-line pt-6 text-sm text-muted",
			children: [
				"Next:",
				" ",
				/* @__PURE__ */ u$1("a", {
					class: "font-semibold text-accent hover:underline",
					href: "/docs/hono",
					children: "Hono integration and deployment →"
				})
			]
		})
	] });
}
var head$2, routeTreeExample, islandExample, middlewareExample;
var init_routing = __esmMin((() => {
	init_dist();
	init_CodeBlock();
	init_jsxRuntime();
	head$2 = define.head(/* @__PURE__ */ u$1("title", { children: "Routing and rendering — Hum Guides" }));
	routeTreeExample = `routes/
  _app.tsx          the document shell
  _error.tsx        route errors
  _404.tsx          unmatched paths
  index.tsx         /
  docs/
    _layout.tsx     the guides sidebar
    routing.tsx     /docs/routing
    handlers.tsx    /docs/handlers
    facets.tsx
    streaming.tsx
    partials/
      [[topic]].tsx /docs/partials and /docs/partials/<topic>
  _components/
    CodeBlock.tsx   view component, not a route
  _islands/
    Counter.tsx     the island on the home page
`;
	islandExample = `// routes/index.tsx — the counter on the home page
import Counter from "./_islands/Counter.js";

<Counter start={3} />`;
	middlewareExample = `import { define } from "@humjs/core";

// routes/admin/_middleware.ts — a Hono middleware mounted for this directory
export default define.middleware(async (c, next) => {
  const session = await getSession(c.req.raw);
  if (!session) return c.redirect("/login");
  c.set("user", session.user);
  await next();
});`;
}));
//#endregion
//#region routes/docs/streaming.tsx
var streaming_exports = /* @__PURE__ */ __exportAll({
	config: () => config,
	default: () => streaming_default,
	handlers: () => handlers,
	head: () => head$1
});
async function loadDemoData() {
	await new Promise((resolve) => setTimeout(resolve, 1200));
	return { message: "The delayed server data has arrived." };
}
function ResourceDemo({ data }) {
	return /* @__PURE__ */ u$1("p", {
		class: "font-semibold text-accent-strong",
		"aria-live": "polite",
		children: data.message
	});
}
function BrokenRenderDemo() {
	throw new Error("Intentional render error.");
}
var config, handlers, head$1, resourceExample, streaming_default;
var init_streaming = __esmMin((() => {
	init_dist();
	init_CodeBlock();
	init_jsxRuntime();
	config = define.config({ streaming: true });
	handlers = define.handlers({ GET: () => page({
		demo: createResource(loadDemoData()),
		renderError: createResource(loadDemoData())
	}) });
	head$1 = define.head(/* @__PURE__ */ u$1("title", { children: "Experimental streaming — Hum Guides" }));
	resourceExample = `// routes/docs/streaming.tsx — the two demos above
import { createResource, define, page, Suspense, type Resource } from "@humjs/core";

type DemoData = { message: string };
type PageData = { demo: Resource<DemoData>; renderError: Resource<void> };

async function loadDemoData(): Promise<DemoData> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return { message: "The delayed server data has arrived." };
}

export const config = define.config({ streaming: true });

export const handlers = define.handlers({
  GET: () =>
    page({
      demo: createResource(loadDemoData()),
      renderError: createResource(loadDemoData()),
    }),
});

export default define.page<PageData>(({ data }) => (
  <>
    <Suspense
      resource={data.demo}
      fallback={<p role="status">Loading server data…</p>}
      errorFallback={<p role="alert">Could not load server data.</p>}
    >
      {(demo) => <ResourceDemo data={demo} />}
    </Suspense>

    <Suspense
      resource={data.renderError}
      fallback={<p role="status">Loading server data…</p>}
      errorFallback={(error) => <p role="alert">Error caught: {String(error)}</p>}
    >
      {() => <BrokenRenderDemo />}
    </Suspense>
  </>
));`;
	streaming_default = define.page(({ data }) => {
		return /* @__PURE__ */ u$1("article", { children: [
			/* @__PURE__ */ u$1("h1", {
				class: "text-3xl font-black tracking-tight sm:text-4xl",
				children: "Experimental streaming"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-5 text-lg leading-8 text-muted",
				children: "Streaming SSR is an opt-in escape hatch for routes that benefit from sending the page shell before suspended content is ready. Routes without streaming enabled keep Hum’s normal complete-document rendering."
			}),
			/* @__PURE__ */ u$1("section", {
				class: "mt-8 rounded-2xl border border-line bg-surface-2 p-5",
				children: [
					/* @__PURE__ */ u$1("h2", {
						class: "text-lg font-extrabold",
						children: "Live resource demo"
					}),
					/* @__PURE__ */ u$1("p", {
						class: "mt-2 text-sm leading-6 text-muted",
						children: "This message is resolved by a server request started in this route’s handler. The page shell streams first; the resource arrives after a short delay."
					}),
					/* @__PURE__ */ u$1("div", {
						class: "mt-4 rounded-xl bg-surface px-4 py-3",
						children: /* @__PURE__ */ u$1(Suspense, {
							resource: data.demo,
							fallback: /* @__PURE__ */ u$1("p", {
								role: "status",
								children: "Loading server data…"
							}),
							errorFallback: /* @__PURE__ */ u$1("p", {
								role: "alert",
								children: "Could not load server data."
							}),
							children: (demo) => /* @__PURE__ */ u$1(ResourceDemo, { data: demo })
						})
					})
				]
			}),
			/* @__PURE__ */ u$1("section", {
				class: "mt-5 rounded-2xl border border-danger-line bg-danger-bg p-5",
				children: [
					/* @__PURE__ */ u$1("h2", {
						class: "text-lg font-extrabold",
						children: "Component render error demo"
					}),
					/* @__PURE__ */ u$1("p", {
						class: "mt-2 text-sm leading-6 text-muted",
						children: "This resource resolves successfully, then its child deliberately throws while rendering. The boundary should show its error fallback."
					}),
					/* @__PURE__ */ u$1("div", {
						class: "mt-4 rounded-xl bg-surface px-4 py-3",
						children: /* @__PURE__ */ u$1(Suspense, {
							resource: data.renderError,
							fallback: /* @__PURE__ */ u$1("p", {
								role: "status",
								children: "Loading server data…"
							}),
							errorFallback: (error) => /* @__PURE__ */ u$1("p", {
								role: "alert",
								class: "font-semibold text-danger",
								children: ["Error caught: ", String(error)]
							}),
							children: () => /* @__PURE__ */ u$1(BrokenRenderDemo, {})
						})
					})
				]
			}),
			/* @__PURE__ */ u$1("h2", {
				class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
				children: "Enable it for one route"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-3 leading-7 text-muted",
				children: [
					"Set ",
					/* @__PURE__ */ u$1("code", { children: "streaming: true" }),
					" in the route’s config, then use Hum’s",
					" ",
					/* @__PURE__ */ u$1("code", { children: "Suspense" }),
					" ",
					"with a resource. It shows the pending fallback first, renders the resource value when ready, or displays the error fallback if loading fails. The code below is the whole route behind the demos above."
				]
			}),
			/* @__PURE__ */ u$1(CodeBlock, {
				code: resourceExample,
				language: "typescript"
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-5 leading-7 text-muted",
				children: [
					"The handler starts the request and passes a stable resource to the page.",
					/* @__PURE__ */ u$1("code", { children: "profile.read()" }),
					" ",
					"returns the value when ready or suspends while pending. If it rejects, Hum’s ",
					/* @__PURE__ */ u$1("code", { children: "Suspense" }),
					" ",
					"takes care of pending and rejected states in one place. Create the resource once per request in the handler."
				]
			}),
			/* @__PURE__ */ u$1("h2", {
				class: "mt-12 text-xl font-extrabold tracking-tight sm:text-2xl",
				children: "Early-stage limitations"
			}),
			/* @__PURE__ */ u$1("ul", {
				class: "mt-3 list-disc space-y-2 pl-6 leading-7 text-muted",
				children: [
					/* @__PURE__ */ u$1("li", { children: "This uses Preact’s early-stage Web Streams SSR implementation and is experimental." }),
					/* @__PURE__ */ u$1("li", { children: "Once streaming begins, the HTTP status and response headers can no longer be changed." }),
					/* @__PURE__ */ u$1("li", { children: [
						"Hum’s ",
						/* @__PURE__ */ u$1("code", { children: "Suspense" }),
						" ",
						"renders its configured error fallback if a resource rejects or a child component throws while rendering inside that boundary."
					] }),
					/* @__PURE__ */ u$1("li", { children: [
						"Errors outside a Hum ",
						/* @__PURE__ */ u$1("code", { children: "Suspense" }),
						" ",
						"boundary are not handled by that boundary. If they happen after the shell starts streaming, Hum cannot replace the response or route it to the ",
						/* @__PURE__ */ u$1("code", { children: "_error" }),
						" ",
						"page; the stream may fail. Put potentially failing streamed content inside a boundary with an appropriate error fallback."
					] }),
					/* @__PURE__ */ u$1("li", { children: "Use it selectively and verify the behavior with your own suspended components before relying on it." })
				]
			}),
			/* @__PURE__ */ u$1("p", {
				class: "mt-12 border-t border-line pt-6 text-sm text-muted",
				children: [
					"Next:",
					" ",
					/* @__PURE__ */ u$1("a", {
						class: "font-semibold text-accent hover:underline",
						href: "/docs/partials",
						children: "Partial page updates →"
					})
				]
			})
		] });
	});
}));
//#endregion
//#region routes/index.tsx
var routes_exports = /* @__PURE__ */ __exportAll({
	default: () => Home,
	head: () => head
});
function Home() {
	return /* @__PURE__ */ u$1("main", {
		class: "min-h-screen overflow-hidden bg-bg text-fg",
		children: [
			/* @__PURE__ */ u$1("header", {
				class: "relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8",
				children: [/* @__PURE__ */ u$1("a", {
					href: "/",
					class: "flex items-center gap-3",
					"aria-label": "Hum home",
					children: [/* @__PURE__ */ u$1("span", {
						class: "grid size-10 place-items-center rounded-2xl bg-brand text-xl font-black text-brand-fg shadow-sm",
						children: "夯"
					}), /* @__PURE__ */ u$1("span", {
						class: "text-xl font-extrabold tracking-tight",
						children: "Hum"
					})]
				}), /* @__PURE__ */ u$1("nav", {
					class: "flex items-center gap-3 text-sm font-semibold sm:gap-7",
					children: [
						/* @__PURE__ */ u$1("a", {
							class: "hidden text-muted transition hover:text-fg sm:inline",
							href: "/docs/getting-started",
							children: "Guides"
						}),
						/* @__PURE__ */ u$1("a", {
							class: "rounded-full border border-line px-4 py-2 transition hover:border-fg sm:px-5",
							href: "https://github.com/",
							children: ["GitHub ", /* @__PURE__ */ u$1("span", {
								"aria-hidden": "true",
								children: "↗"
							})]
						}),
						/* @__PURE__ */ u$1(__hum_island_default$1, {})
					]
				})]
			}),
			/* @__PURE__ */ u$1("section", {
				class: "relative isolate",
				children: [/* @__PURE__ */ u$1("div", {
					"aria-hidden": "true",
					class: "absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_50%_0%,var(--hum-glow-1)_0%,var(--hum-glow-2)_35%,var(--hum-bg)_78%)]"
				}), /* @__PURE__ */ u$1("div", {
					class: "mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-32 lg:pt-24",
					children: [/* @__PURE__ */ u$1("div", {
						class: "max-w-2xl",
						children: [
							/* @__PURE__ */ u$1("p", {
								class: "mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface-70 px-4 py-2 text-sm font-semibold text-accent-strong shadow-sm",
								children: [/* @__PURE__ */ u$1("span", { class: "size-2 rounded-full bg-[#89b931]" }), "A fresh take on server-rendered apps"]
							}),
							/* @__PURE__ */ u$1("h1", {
								class: "text-balance text-5xl font-black leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-7xl",
								children: [
									"HTML first.",
									/* @__PURE__ */ u$1("br", {}),
									/* @__PURE__ */ u$1("span", {
										class: "text-accent",
										children: "Interactive"
									}),
									" by choice."
								]
							}),
							/* @__PURE__ */ u$1("p", {
								class: "mt-7 max-w-xl text-lg leading-8 text-muted sm:text-xl",
								children: "Build fast, thoughtful web experiences with Preact, file-based routing, and islands that only wake up when you need them."
							}),
							/* @__PURE__ */ u$1("div", {
								class: "mt-9 flex flex-wrap items-center gap-3",
								children: [/* @__PURE__ */ u$1("a", {
									href: "#start",
									class: "rounded-full bg-fg px-6 py-3.5 font-bold text-bg shadow-lg shadow-elevation transition hover:-translate-y-0.5 hover:bg-fg-hover",
									children: ["Get started ", /* @__PURE__ */ u$1("span", {
										"aria-hidden": "true",
										children: "→"
									})]
								}), /* @__PURE__ */ u$1("a", {
									href: "/docs/getting-started",
									class: "rounded-full px-6 py-3.5 font-bold text-fg-soft transition hover:bg-surface-70",
									children: "Explore Hum"
								})]
							}),
							/* @__PURE__ */ u$1("p", {
								class: "mt-9 text-sm font-medium text-muted",
								children: [
									"Hono ",
									/* @__PURE__ */ u$1("span", {
										class: "mx-2 text-faint",
										children: "·"
									}),
									" Preact",
									/* @__PURE__ */ u$1("span", {
										class: "mx-2 text-faint",
										children: "·"
									}),
									" Vite"
								]
							})
						]
					}), /* @__PURE__ */ u$1("div", {
						class: "relative mx-auto w-full max-w-xl lg:ml-auto",
						children: [
							/* @__PURE__ */ u$1("div", {
								"aria-hidden": "true",
								class: "absolute -right-6 -top-8 size-28 rounded-full bg-[#d7f15e] blur-2xl sm:-right-3"
							}),
							/* @__PURE__ */ u$1("div", {
								"aria-hidden": "true",
								class: "absolute -bottom-10 -left-8 size-36 rounded-full bg-[#b8e4a0] blur-3xl"
							}),
							/* @__PURE__ */ u$1("div", {
								class: "relative rotate-1 rounded-[2rem] border border-line bg-surface-80 p-3 shadow-[0_30px_100px_-35px_rgba(36,65,34,0.35)] backdrop-blur",
								children: /* @__PURE__ */ u$1("div", {
									class: "overflow-hidden rounded-[1.45rem] bg-code text-[#e8f1e8]",
									children: [
										/* @__PURE__ */ u$1("div", {
											class: "flex items-center gap-2 border-b border-white/10 px-5 py-4",
											children: [
												/* @__PURE__ */ u$1("span", { class: "size-2.5 rounded-full bg-[#ff786b]" }),
												/* @__PURE__ */ u$1("span", { class: "size-2.5 rounded-full bg-[#f3c95d]" }),
												/* @__PURE__ */ u$1("span", { class: "size-2.5 rounded-full bg-[#83c86f]" }),
												/* @__PURE__ */ u$1("span", {
													class: "ml-3 text-xs font-medium text-[#8e9c8f]",
													children: "routes/index.tsx"
												})
											]
										}),
										/* @__PURE__ */ u$1("pre", {
											class: "overflow-x-auto p-6 font-mono text-sm leading-6 text-[#e8f1e8] sm:p-8",
											children: /* @__PURE__ */ u$1(SyntaxCode, {
												code: heroExample,
												language: "typescript"
											})
										}),
										/* @__PURE__ */ u$1("div", {
											class: "flex items-center justify-between border-t border-white/10 bg-white/[0.04] px-6 py-4 text-xs",
											children: [/* @__PURE__ */ u$1("span", {
												class: "text-[#9eaa9f]",
												children: "Server-rendered by default"
											}), /* @__PURE__ */ u$1("span", {
												class: "flex items-center gap-2 text-[#bce979]",
												children: [/* @__PURE__ */ u$1("span", { class: "size-1.5 rounded-full bg-[#bce979]" }), "Ready in 34ms"]
											})]
										})
									]
								})
							}),
							/* @__PURE__ */ u$1("div", {
								class: "absolute -bottom-7 right-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-bold shadow-xl shadow-elevation sm:-right-7",
								children: [
									/* @__PURE__ */ u$1("span", {
										class: "mr-2 text-accent",
										children: "✳"
									}),
									" ",
									"Just the JavaScript you need"
								]
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ u$1("section", {
				id: "features",
				class: "mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24",
				children: [/* @__PURE__ */ u$1("div", {
					class: "mx-auto max-w-2xl text-center",
					children: [
						/* @__PURE__ */ u$1("p", {
							class: "text-sm font-bold uppercase tracking-[0.18em] text-accent",
							children: "Small by design"
						}),
						/* @__PURE__ */ u$1("h2", {
							class: "mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl",
							children: "Less shipped. More enjoyed."
						}),
						/* @__PURE__ */ u$1("p", {
							class: "mt-5 text-lg leading-8 text-muted",
							children: "Start with a complete page. Add client-side behavior only to the pieces that benefit from it."
						})
					]
				}), /* @__PURE__ */ u$1("div", {
					class: "mt-12 grid gap-4 md:grid-cols-3",
					children: [
						/* @__PURE__ */ u$1("article", {
							class: "rounded-3xl border border-line bg-surface p-7 shadow-sm shadow-elevation",
							children: [
								/* @__PURE__ */ u$1("span", {
									class: "grid size-12 place-items-center rounded-2xl bg-accent-bg text-2xl text-accent",
									children: "◉"
								}),
								/* @__PURE__ */ u$1("h3", {
									class: "mt-6 text-xl font-extrabold",
									children: "HTML, up front"
								}),
								/* @__PURE__ */ u$1("p", {
									class: "mt-3 leading-7 text-muted",
									children: "Pages render on the server and arrive ready to read. Keep the browser payload focused on what matters."
								}),
								/* @__PURE__ */ u$1("a", {
									class: "mt-5 inline-flex font-bold text-accent hover:underline",
									href: "/docs/handlers",
									children: ["Read about handlers ", /* @__PURE__ */ u$1("span", {
										class: "ml-2",
										"aria-hidden": "true",
										children: "→"
									})]
								})
							]
						}),
						/* @__PURE__ */ u$1("article", {
							class: "rounded-3xl border border-line bg-surface p-7 shadow-sm shadow-elevation",
							children: [
								/* @__PURE__ */ u$1("span", {
									class: "grid size-12 place-items-center rounded-2xl bg-accent-bg text-2xl text-[#38845a]",
									children: "✳"
								}),
								/* @__PURE__ */ u$1("h3", {
									class: "mt-6 text-xl font-extrabold",
									children: "Islands, on purpose"
								}),
								/* @__PURE__ */ u$1("p", {
									class: "mt-3 leading-7 text-muted",
									children: "Hydrate individual Preact components when a little interaction makes the experience better."
								}),
								/* @__PURE__ */ u$1("a", {
									class: "mt-5 inline-flex font-bold text-accent hover:underline",
									href: "/docs/partials",
									children: ["Explore partials ", /* @__PURE__ */ u$1("span", {
										class: "ml-2",
										"aria-hidden": "true",
										children: "→"
									})]
								})
							]
						}),
						/* @__PURE__ */ u$1("article", {
							class: "rounded-3xl border border-line bg-surface p-7 shadow-sm shadow-elevation",
							children: [
								/* @__PURE__ */ u$1("span", {
									class: "grid size-12 place-items-center rounded-2xl bg-[#fff2d8] text-2xl text-[#b47d21]",
									children: "↗"
								}),
								/* @__PURE__ */ u$1("h3", {
									class: "mt-6 text-xl font-extrabold",
									children: "A familiar toolkit"
								}),
								/* @__PURE__ */ u$1("p", {
									class: "mt-3 leading-7 text-muted",
									children: "Build with file-based routes, Hono, Preact, and Vite—tools that feel right at home in the modern web."
								})
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ u$1("section", {
				id: "demo",
				class: "px-5 py-12 sm:px-8 sm:py-20",
				children: /* @__PURE__ */ u$1("div", {
					class: "mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-[2rem] bg-code p-7 text-white sm:p-12 lg:grid-cols-2 lg:items-center lg:p-16",
					children: [/* @__PURE__ */ u$1("div", { children: [
						/* @__PURE__ */ u$1("p", {
							class: "text-sm font-bold uppercase tracking-[0.18em] text-[#b8df73]",
							children: "A tiny island"
						}),
						/* @__PURE__ */ u$1("h2", {
							class: "mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl",
							children: "Try the interactive bit."
						}),
						/* @__PURE__ */ u$1("p", {
							class: "mt-5 max-w-lg leading-7 text-[#c0cbc0]",
							children: "This counter is hydrated in your browser. Everything else on this page stays plain, server-rendered HTML."
						})
					] }), /* @__PURE__ */ u$1("div", {
						class: "flex min-h-48 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.06] p-7",
						children: [
							/* @__PURE__ */ u$1("span", {
								class: "mb-5 text-sm font-medium text-[#aebaae]",
								children: "Count something"
							}),
							/* @__PURE__ */ u$1(__hum_island_default, { start: 3 }),
							/* @__PURE__ */ u$1("span", {
								class: "mt-5 text-xs text-[#89978a]",
								children: "Only this little island needs JavaScript."
							})
						]
					})]
				})
			}),
			/* @__PURE__ */ u$1("section", {
				id: "start",
				class: "mx-auto max-w-7xl px-5 py-20 text-center sm:px-8 sm:py-28",
				children: [
					/* @__PURE__ */ u$1("p", {
						class: "text-sm font-bold uppercase tracking-[0.18em] text-accent",
						children: "Your next project starts here"
					}),
					/* @__PURE__ */ u$1("h2", {
						class: "mx-auto mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl",
						children: [
							"Keep it simple.",
							/* @__PURE__ */ u$1("br", { class: "hidden sm:block" }),
							" Make it feel alive."
						]
					}),
					/* @__PURE__ */ u$1("p", {
						class: "mt-5 text-lg text-muted",
						children: "Create a Hum app and make the web yours."
					}),
					/* @__PURE__ */ u$1("p", {
						class: "mt-5 text-sm font-semibold text-accent",
						children: [
							/* @__PURE__ */ u$1("a", {
								class: "hover:underline",
								href: "/docs/handlers",
								children: "Route handlers"
							}),
							/* @__PURE__ */ u$1("span", {
								class: "mx-3 text-faint",
								children: "·"
							}),
							/* @__PURE__ */ u$1("a", {
								class: "hover:underline",
								href: "/docs/partials",
								children: "Partial updates"
							})
						]
					}),
					/* @__PURE__ */ u$1("div", {
						class: "mx-auto mt-8 flex w-fit max-w-full items-center gap-4 rounded-2xl bg-code px-5 py-4 text-left font-mono text-sm text-[#e7f1e4] shadow-xl shadow-elevation sm:px-7",
						children: [
							/* @__PURE__ */ u$1("span", {
								class: "select-none text-[#8eab71]",
								children: "$"
							}),
							/* @__PURE__ */ u$1("code", {
								class: "overflow-x-auto whitespace-nowrap",
								children: "npm create hum@latest"
							}),
							/* @__PURE__ */ u$1("span", {
								class: "select-none text-[#9bc96a]",
								children: "↵"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ u$1("footer", {
				class: "border-t border-line",
				children: /* @__PURE__ */ u$1("div", {
					class: "mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8",
					children: [/* @__PURE__ */ u$1("a", {
						href: "/",
						class: "font-extrabold tracking-tight text-fg",
						children: ["hum", /* @__PURE__ */ u$1("span", {
							class: "text-accent",
							children: "."
						})]
					}), /* @__PURE__ */ u$1("p", { children: "Built for the parts of the web that should stay simple." })]
				})
			})
		]
	});
}
var head, heroExample;
var init_routes = __esmMin((() => {
	init_Counter();
	init_ThemeToggle();
	init_CodeBlock();
	init_dist();
	init_jsxRuntime();
	head = /* @__PURE__ */ u$1(M$2, { children: [/* @__PURE__ */ u$1("title", { children: "Hum — HTML first. Interactive by choice." }), /* @__PURE__ */ u$1("meta", {
		name: "description",
		content: "Hum is a small, fast web framework for building HTML-first apps with Preact islands."
	})] });
	heroExample = `import Counter from "./_islands/Counter.js";

export default function Home() {
  return (
    <main>
      <h1>HTML first. Interactive by choice.</h1>
      <Counter start={3} />
    </main>
  );
}`;
}));
var manifest = specsFromGlob({
	routesDir: "routes",
	islandsDir: "islands",
	routeModules: /* @__PURE__ */ Object.assign({
		"/routes/_404.tsx": () => Promise.resolve().then(() => (init__404(), _404_exports)),
		"/routes/_app.tsx": () => Promise.resolve().then(() => (init__app(), _app_exports)),
		"/routes/_error.tsx": () => Promise.resolve().then(() => (init__error(), _error_exports)),
		"/routes/docs/_layout.tsx": () => Promise.resolve().then(() => (init__layout(), _layout_exports)),
		"/routes/docs/facets.tsx": () => Promise.resolve().then(() => (init_facets(), facets_exports)),
		"/routes/docs/getting-started.tsx": () => Promise.resolve().then(() => (init_getting_started(), getting_started_exports)),
		"/routes/docs/handlers.tsx": () => Promise.resolve().then(() => (init_handlers(), handlers_exports)),
		"/routes/docs/hono.tsx": () => Promise.resolve().then(() => (init_hono(), hono_exports)),
		"/routes/docs/partials/[[topic]].tsx": () => Promise.resolve().then(() => (init___topic__(), __topic___exports)),
		"/routes/docs/routing.tsx": () => Promise.resolve().then(() => (init_routing(), routing_exports)),
		"/routes/docs/streaming.tsx": () => Promise.resolve().then(() => (init_streaming(), streaming_exports)),
		"/routes/index.tsx": () => Promise.resolve().then(() => (init_routes(), routes_exports))
	}),
	islandModules: /* @__PURE__ */ Object.assign({}),
	localIslandModules: /* @__PURE__ */ Object.assign({
		"/routes/_islands/Counter.tsx": () => Promise.resolve().then(() => (init_Counter(), Counter_exports)),
		"/routes/_islands/ThemeToggle.tsx": () => Promise.resolve().then(() => (init_ThemeToggle(), ThemeToggle_exports))
	})
});
manifest.routes;
manifest.islands;
//#endregion
//#region \0virtual:hum/build
init_dist();
defineBuild({
	routes: manifest.routes,
	islands: manifest.islands,
	prod: {
		"buildId": "mva2tfcp4opo",
		"assetsBase": "/_hum",
		"clientEntry": "assets/runtime-DwYktPAO.js",
		"islands": {
			"local__islands_Counter": { "file": "assets/Counter-H0iGcd-8.js" },
			"local__islands_ThemeToggle": { "file": "assets/ThemeToggle-58BFUsYU.js" }
		},
		"entryAssets": ["assets/runtime-VZKffVDX.css"]
	}
});
//#endregion
//#region ../../node_modules/.pnpm/@hono+node-server@2.1.4_hono@4.13.13/node_modules/@hono/node-server/dist/index.mjs
var RequestError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "RequestError";
	}
};
var nonJoinedHeaders = /* @__PURE__ */ new Set([
	"age",
	"authorization",
	"content-length",
	"content-type",
	"etag",
	"expires",
	"from",
	"host",
	"if-modified-since",
	"if-unmodified-since",
	"last-modified",
	"location",
	"max-forwards",
	"proxy-authorization",
	"referer",
	"retry-after",
	"server",
	"user-agent"
]);
var validHeaderName = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
var isHttpWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
var normalizeHeaderValue = (value) => {
	if (!isHttpWhitespace(value.charCodeAt(0)) && !isHttpWhitespace(value.charCodeAt(value.length - 1))) return value;
	let start = 0;
	let end = value.length;
	while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
	while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
	return value.slice(start, end);
};
var forbiddenHeaderValue = /[\0\r\n]/;
var GlobalHeaders = globalThis.Headers;
var materializeHeaders = (rawHeaders, HeadersCtor = GlobalHeaders) => {
	const headers = new HeadersCtor();
	for (let i = 0; i < rawHeaders.length; i += 2) {
		const name = rawHeaders[i];
		if (!name.startsWith(":")) headers.append(name, rawHeaders[i + 1]);
	}
	return headers;
};
var RequestHeaders = class {
	#incoming;
	#rawHeaders;
	#headers;
	#invalidValue;
	constructor(incoming) {
		this.#incoming = incoming;
		if (incoming instanceof Http2ServerRequest) this.#rawHeaders = incoming.rawHeaders.slice();
	}
	get #lazyRawHeaders() {
		return this.#rawHeaders ??= this.#incoming.rawHeaders.slice();
	}
	get #native() {
		if (!this.#headers) {
			this.#headers = materializeHeaders(this.#lazyRawHeaders);
			this.#rawHeaders = void 0;
		}
		return this.#headers;
	}
	#normalizedName(name) {
		if (typeof name !== "string") return;
		if (!validHeaderName.test(name)) throw new TypeError(`Invalid header name: ${name}`);
		return name.toLowerCase();
	}
	#lookupHttp1(lowerName) {
		const headers = this.#incoming instanceof Http2ServerRequest ? void 0 : this.#incoming.headers;
		if (!headers || nonJoinedHeaders.has(lowerName) || lowerName === "set-cookie" || lowerName === "__proto__") return;
		if (!Object.hasOwn(headers, lowerName)) return null;
		const rawValue = headers[lowerName];
		if (typeof rawValue === "string") {
			const value = normalizeHeaderValue(rawValue);
			return forbiddenHeaderValue.test(value) ? void 0 : value;
		}
	}
	#lookup(rawHeaders, lowerName) {
		const separator = lowerName === "cookie" ? "; " : ", ";
		let value = null;
		for (let i = 0; i < rawHeaders.length; i += 2) {
			const rawName = rawHeaders[i];
			if (rawName.length === lowerName.length && rawName.toLowerCase() === lowerName) {
				const rawValue = normalizeHeaderValue(rawHeaders[i + 1]);
				if (forbiddenHeaderValue.test(rawValue)) {
					this.#invalidValue = true;
					return;
				}
				value = value === null ? rawValue : value + separator + rawValue;
			}
		}
		return value;
	}
	append(name, value) {
		this.#native.append(name, value);
	}
	delete(name) {
		this.#native.delete(name);
	}
	get(name) {
		const lowerName = this.#normalizedName(name);
		if (lowerName && !this.#headers && !this.#invalidValue) {
			const http1Value = this.#lookupHttp1(lowerName);
			if (http1Value !== void 0) return http1Value;
			const value = this.#lookup(this.#lazyRawHeaders, lowerName);
			if (value !== void 0) return value;
		}
		return this.#native.get(name);
	}
	has(name) {
		const lowerName = this.#normalizedName(name);
		if (lowerName && !this.#headers && !this.#invalidValue) {
			const http1Value = this.#lookupHttp1(lowerName);
			if (http1Value !== void 0) return http1Value !== null;
			const value = this.#lookup(this.#lazyRawHeaders, lowerName);
			if (value !== void 0) return value !== null;
		}
		return this.#native.has(name);
	}
	set(name, value) {
		this.#native.set(name, value);
	}
	getSetCookie() {
		return this.#native.getSetCookie();
	}
	keys() {
		return this.#native.keys();
	}
	values() {
		return this.#native.values();
	}
	entries() {
		return this.#native.entries();
	}
	forEach(callback, thisArg) {
		this.#native.forEach((value, key) => {
			callback.call(thisArg, value, key, this);
		});
	}
	[Symbol.iterator]() {
		return this.entries();
	}
};
Object.defineProperty(RequestHeaders.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
	return `Headers (lightweight) ${inspectFn(Object.fromEntries(this), {
		...options,
		depth: depth == null ? null : depth - 1
	})}`;
} });
Object.setPrototypeOf(RequestHeaders.prototype, GlobalHeaders.prototype);
var newHeadersFromIncoming = (incoming) => globalThis.Headers === GlobalHeaders ? new RequestHeaders(incoming) : materializeHeaders(incoming.rawHeaders, globalThis.Headers);
var reValidRequestUrl = /^\/[!#$&-;=?-\[\]_a-z~]*$/;
var reDotSegment = /\/\.\.?(?:[/?#]|$)/;
var reValidHost = /^[a-z0-9._-]+(?::(?:[1-5]\d{3,4}|[6-9]\d{3}))?$/;
var buildUrl = (scheme, host, incomingUrl) => {
	const url = `${scheme}://${host}${incomingUrl}`;
	if (!reValidHost.test(host)) {
		const urlObj = new URL(url);
		if (urlObj.hostname.length !== host.length && urlObj.hostname !== (host.includes(":") ? host.replace(/:\d+$/, "") : host).toLowerCase()) throw new RequestError("Invalid host header");
		return urlObj.href;
	} else if (incomingUrl.length === 0) return url + "/";
	else {
		if (incomingUrl.charCodeAt(0) !== 47) throw new RequestError("Invalid URL");
		if (!reValidRequestUrl.test(incomingUrl) || reDotSegment.test(incomingUrl)) return new URL(url).href;
		return url;
	}
};
var toRequestError = (e) => {
	if (e instanceof RequestError) return e;
	return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request$1 = class extends GlobalRequest {
	constructor(input, options) {
		if (typeof input === "object" && getRequestCache in input) {
			const hasReplacementBody = options !== void 0 && "body" in options && options.body != null;
			if (input[bodyConsumedDirectlyKey] && !hasReplacementBody) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
			input = input[getRequestCache]();
		}
		if (typeof (options?.body)?.getReader !== "undefined") options.duplex ??= "half";
		super(input, options);
	}
};
var wrapBodyStream = Symbol("wrapBodyStream");
var byteExactEncodings = /* @__PURE__ */ new Set([
	"latin1",
	"binary",
	"hex",
	"base64",
	"base64url"
]);
var isByteExactEncoding = (encoding) => encoding === null || byteExactEncodings.has(encoding);
var bodyBufferedBeforeDisconnectKey = Symbol("bodyBufferedBeforeDisconnect");
var bodyBufferedLengthBeforeDisconnectKey = Symbol("bodyBufferedLengthBeforeDisconnect");
var toBufferChunk = (chunk, encoding) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding ?? "utf8");
var isRecoverableDisconnectedIncoming = (incoming) => !(incoming instanceof Http2ServerRequest) && !!incoming.complete && !!incoming.readableAborted && typeof incoming.read === "function" && isByteExactEncoding(incoming.readableEncoding);
var recordBodyBufferedBeforeDisconnect = (incoming) => {
	if (incoming.readableDidRead || !isRecoverableDisconnectedIncoming(incoming)) return;
	const incomingWithRecovery = incoming;
	incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] ??= incoming.readableLength;
};
var readBodyBufferedBeforeDisconnect = (incoming, chunks) => {
	if (incoming.readableDidRead && !chunks || !isRecoverableDisconnectedIncoming(incoming)) return;
	const incomingWithRecovery = incoming;
	if (incomingWithRecovery[bodyBufferedBeforeDisconnectKey] !== void 0) return incomingWithRecovery[bodyBufferedBeforeDisconnectKey];
	let result;
	const errored = incoming.errored;
	if (errored && errored.code !== "ECONNRESET") result = errored;
	else if (incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] !== void 0 && incoming.readableLength !== incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey]) result = newBodyUnusableError();
	else {
		const bodyChunks = chunks ?? [];
		const chunk = incoming.read();
		if (chunk !== null) bodyChunks.push(toBufferChunk(chunk, incoming.readableEncoding));
		const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks);
		result = buffer;
		const contentLength = incoming.headers["content-length"];
		if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
			const expectedLength = Number(contentLength);
			if (Number.isSafeInteger(expectedLength) && buffer.length !== expectedLength) result = newBodyUnusableError();
		}
	}
	incomingWithRecovery[bodyBufferedBeforeDisconnectKey] = result;
	return result;
};
var enqueueBufferedBody = (controller, buffered) => {
	if (buffered instanceof Error) {
		controller.error(buffered);
		return;
	}
	if (buffered.length > 0) controller.enqueue(buffered);
	controller.close();
};
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
	const init = {
		method,
		headers,
		signal: abortController.signal
	};
	if (method === "TRACE") {
		init.method = "GET";
		const req = new Request$1(url, init);
		Object.defineProperty(req, "method", { get() {
			return "TRACE";
		} });
		return req;
	}
	if (!(method === "GET" || method === "HEAD")) if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
		controller.enqueue(incoming.rawBody);
		controller.close();
	} });
	else if (incoming[wrapBodyStream]) {
		let reader;
		init.body = new ReadableStream({ async pull(controller) {
			try {
				if (!reader) {
					const buffered = readBodyBufferedBeforeDisconnect(incoming);
					if (buffered !== void 0) {
						enqueueBufferedBody(controller, buffered);
						return;
					}
				}
				reader ||= Readable.toWeb(incoming).getReader();
				const { done, value } = await reader.read();
				if (done) controller.close();
				else controller.enqueue(value);
			} catch (error) {
				controller.error(error);
			}
		} });
	} else {
		const buffered = readBodyBufferedBeforeDisconnect(incoming);
		if (buffered !== void 0) init.body = new ReadableStream({ start(controller) {
			enqueueBufferedBody(controller, buffered);
		} });
		else init.body = Readable.toWeb(incoming);
	}
	return new Request$1(url, init);
};
var getRequestCache = Symbol("getRequestCache");
var requestCache = Symbol("requestCache");
var incomingKey = Symbol("incomingKey");
var urlKey = Symbol("urlKey");
var methodKey = Symbol("methodKey");
var headersKey = Symbol("headersKey");
var abortControllerKey = Symbol("abortControllerKey");
var getAbortController = Symbol("getAbortController");
var abortRequest = Symbol("abortRequest");
var bodyBufferKey = Symbol("bodyBuffer");
var bodyReadPromiseKey = Symbol("bodyReadPromise");
var bodyConsumedDirectlyKey = Symbol("bodyConsumedDirectly");
var bodyLockReaderKey = Symbol("bodyLockReader");
var abortReasonKey = Symbol("abortReason");
var newBodyUnusableError = () => {
	return /* @__PURE__ */ new TypeError("Body is unusable");
};
var rejectBodyUnusable = () => {
	return Promise.reject(newBodyUnusableError());
};
var textDecoder = new TextDecoder();
var consumeBodyDirectOnce = (request) => {
	if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
	request[bodyConsumedDirectlyKey] = true;
};
var toArrayBuffer = (buf) => {
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
var contentType = (request) => {
	return (request[headersKey] ||= newHeadersFromIncoming(request[incomingKey])).get("content-type") || "";
};
var methodTokenRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var normalizeIncomingMethod = (method) => {
	if (typeof method !== "string" || method.length === 0) return "GET";
	switch (method) {
		case "DELETE":
		case "GET":
		case "HEAD":
		case "OPTIONS":
		case "PATCH":
		case "POST":
		case "PUT":
		case "QUERY": return method;
	}
	const upper = method.toUpperCase();
	switch (upper) {
		case "DELETE":
		case "GET":
		case "HEAD":
		case "OPTIONS":
		case "POST":
		case "PUT": return upper;
		default: return method;
	}
};
var validateDirectReadMethod = (method) => {
	if (!methodTokenRegExp.test(method)) return /* @__PURE__ */ new TypeError(`'${method}' is not a valid HTTP method.`);
	const normalized = method.toUpperCase();
	if (normalized === "CONNECT" || normalized === "TRACK" || normalized === "TRACE" && method !== "TRACE") return /* @__PURE__ */ new TypeError(`'${method}' HTTP method is unsupported.`);
};
var readBodyWithFastPath = (request, method, fromBuffer) => {
	if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
	const methodName = request.method;
	if (methodName === "GET" || methodName === "HEAD") return request[getRequestCache]()[method]();
	const methodValidationError = validateDirectReadMethod(methodName);
	if (methodValidationError) return Promise.reject(methodValidationError);
	if (request[requestCache]) {
		if (methodName !== "TRACE") return request[requestCache][method]();
	}
	const alreadyUsedError = consumeBodyDirectOnce(request);
	if (alreadyUsedError) return alreadyUsedError;
	const raw = readRawBodyIfAvailable(request);
	if (raw) {
		const result = Promise.resolve(fromBuffer(raw, request));
		request[bodyBufferKey] = void 0;
		return result;
	}
	return readBodyDirect(request).then((buf) => {
		const result = fromBuffer(buf, request);
		request[bodyBufferKey] = void 0;
		return result;
	});
};
var readRawBodyIfAvailable = (request) => {
	const incoming = request[incomingKey];
	if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) return incoming.rawBody;
};
var normalizeAbortError = (request, incoming) => {
	if (incoming.errored) return incoming.errored;
	const reason = request[abortReasonKey];
	if (reason !== void 0) return reason instanceof Error ? reason : new Error(String(reason));
	return /* @__PURE__ */ new Error("Client connection prematurely closed.");
};
var readBodyDirect = (request) => {
	if (request[bodyBufferKey]) return Promise.resolve(request[bodyBufferKey]);
	if (request[bodyReadPromiseKey]) return request[bodyReadPromiseKey];
	const incoming = request[incomingKey];
	if (incoming.readableDidRead) return rejectBodyUnusable();
	const buffered = readBodyBufferedBeforeDisconnect(incoming);
	if (buffered !== void 0) {
		if (buffered instanceof Error) return Promise.reject(buffered);
		request[bodyBufferKey] = buffered;
		return Promise.resolve(buffered);
	}
	const promise = new Promise((resolve, reject) => {
		const chunks = [];
		let settled = false;
		const finish = (callback) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const recoverCompleteBodyAfterDisconnect = (error) => {
			const streamError = incoming.errored ?? error;
			if (!isRecoverableDisconnectedIncoming(incoming) || streamError && streamError.code !== "ECONNRESET") return false;
			finish(() => {
				const recovered = readBodyBufferedBeforeDisconnect(incoming, chunks);
				if (recovered instanceof Error) reject(recovered);
				else if (recovered === void 0) reject(error ?? normalizeAbortError(request, incoming));
				else {
					request[bodyBufferKey] = recovered;
					resolve(recovered);
				}
			});
			return true;
		};
		const onData = (chunk) => {
			chunks.push(toBufferChunk(chunk, incoming.readableEncoding));
		};
		const onEnd = () => {
			finish(() => {
				const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
				request[bodyBufferKey] = buffer;
				resolve(buffer);
			});
		};
		const onError = (error) => {
			if (recoverCompleteBodyAfterDisconnect(error)) return;
			finish(() => {
				reject(error);
			});
		};
		const onClose = () => {
			if (incoming.readableEnded) {
				onEnd();
				return;
			}
			if (recoverCompleteBodyAfterDisconnect()) return;
			finish(() => {
				reject(normalizeAbortError(request, incoming));
			});
		};
		const cleanup = () => {
			incoming.off("data", onData);
			incoming.off("end", onEnd);
			incoming.off("error", onError);
			incoming.off("close", onClose);
			request[bodyReadPromiseKey] = void 0;
		};
		incoming.on("data", onData);
		incoming.on("end", onEnd);
		incoming.on("error", onError);
		incoming.on("close", onClose);
		queueMicrotask(() => {
			if (settled) return;
			if (incoming.readableEnded) onEnd();
			else if (incoming.errored) onError(incoming.errored);
			else if (incoming.destroyed) onClose();
		});
	});
	request[bodyReadPromiseKey] = promise;
	return promise;
};
var requestPrototype = {
	get method() {
		return this[methodKey];
	},
	get url() {
		return this[urlKey];
	},
	get headers() {
		return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
	},
	[abortRequest](reason) {
		if (this[abortReasonKey] === void 0) this[abortReasonKey] = reason;
		const abortController = this[abortControllerKey];
		if (abortController && !abortController.signal.aborted) abortController.abort(reason);
	},
	[getAbortController]() {
		this[abortControllerKey] ||= new AbortController();
		if (this[abortReasonKey] !== void 0 && !this[abortControllerKey].signal.aborted) this[abortControllerKey].abort(this[abortReasonKey]);
		return this[abortControllerKey];
	},
	[getRequestCache]() {
		const abortController = this[getAbortController]();
		if (this[requestCache]) return this[requestCache];
		const method = this.method;
		if (this[bodyConsumedDirectlyKey] && !(method === "GET" || method === "HEAD")) {
			this[bodyBufferKey] = void 0;
			const init = {
				method: method === "TRACE" ? "GET" : method,
				headers: this.headers,
				signal: abortController.signal
			};
			if (method !== "TRACE") {
				init.body = new ReadableStream({ start(c) {
					c.close();
				} });
				init.duplex = "half";
			}
			const req = new Request$1(this[urlKey], init);
			if (method === "TRACE") Object.defineProperty(req, "method", { get() {
				return "TRACE";
			} });
			return this[requestCache] = req;
		}
		return this[requestCache] = newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], abortController);
	},
	get body() {
		if (!this[bodyConsumedDirectlyKey]) return this[getRequestCache]().body;
		const request = this[getRequestCache]();
		if (!this[bodyLockReaderKey] && request.body) this[bodyLockReaderKey] = request.body.getReader();
		return request.body;
	},
	get bodyUsed() {
		if (this[bodyConsumedDirectlyKey]) return true;
		if (this[requestCache]) return this[requestCache].bodyUsed;
		return false;
	}
};
Object.defineProperty(requestPrototype, "signal", { get() {
	return this[getAbortController]().signal;
} });
[
	"cache",
	"credentials",
	"destination",
	"integrity",
	"mode",
	"redirect",
	"referrer",
	"referrerPolicy",
	"keepalive"
].forEach((k) => {
	Object.defineProperty(requestPrototype, k, { get() {
		return this[getRequestCache]()[k];
	} });
});
["clone", "formData"].forEach((k) => {
	Object.defineProperty(requestPrototype, k, { value: function() {
		if (this[bodyConsumedDirectlyKey]) {
			if (k === "clone") throw newBodyUnusableError();
			return rejectBodyUnusable();
		}
		return this[getRequestCache]()[k]();
	} });
});
Object.defineProperty(requestPrototype, "text", { value: function() {
	return readBodyWithFastPath(this, "text", (buf) => textDecoder.decode(buf));
} });
Object.defineProperty(requestPrototype, "arrayBuffer", { value: function() {
	return readBodyWithFastPath(this, "arrayBuffer", (buf) => toArrayBuffer(buf));
} });
Object.defineProperty(requestPrototype, "blob", { value: function() {
	return readBodyWithFastPath(this, "blob", (buf, request) => {
		const type = contentType(request);
		return new Response(buf, type ? { headers: { "content-type": type } } : void 0).blob();
	});
} });
Object.defineProperty(requestPrototype, "json", { value: function() {
	if (this[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
	return this.text().then(JSON.parse);
} });
Object.defineProperty(requestPrototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
	return `Request (lightweight) ${inspectFn({
		method: this.method,
		url: this.url,
		headers: this.headers,
		nativeRequest: this[requestCache]
	}, {
		...options,
		depth: depth == null ? null : depth - 1
	})}`;
} });
Object.setPrototypeOf(requestPrototype, Request$1.prototype);
var newRequest = (incoming, defaultHostname) => {
	const req = Object.create(requestPrototype);
	req[incomingKey] = incoming;
	req[methodKey] = normalizeIncomingMethod(incoming.method);
	const incomingUrl = incoming.url || "";
	if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
		if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
		try {
			req[urlKey] = new URL(incomingUrl).href;
		} catch (e) {
			throw new RequestError("Invalid absolute URL", { cause: e });
		}
		return req;
	}
	const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
	if (!host) throw new RequestError("Missing host header");
	let scheme;
	if (incoming instanceof Http2ServerRequest) {
		scheme = incoming.scheme;
		if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
	} else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
	try {
		req[urlKey] = buildUrl(scheme, host, incomingUrl);
	} catch (e) {
		if (e instanceof RequestError) throw e;
		else throw new RequestError("Invalid URL", { cause: e });
	}
	return req;
};
var defaultContentType = "text/plain; charset=UTF-8";
var responseCache = Symbol("responseCache");
var getResponseCache = Symbol("getResponseCache");
var cacheKey = Symbol("cache");
var GlobalResponse = global.Response;
var Response$1 = class Response$1 {
	#body;
	#init;
	[getResponseCache]() {
		const cache = this[cacheKey];
		const liveHeaders = cache && cache[2] instanceof Headers ? cache[2] : void 0;
		delete this[cacheKey];
		return this[responseCache] ||= new GlobalResponse(this.#body, liveHeaders ? {
			status: this.#init?.status,
			statusText: this.#init?.statusText,
			headers: liveHeaders
		} : this.#init);
	}
	constructor(body, init) {
		let headers;
		this.#body = body;
		if (init instanceof GlobalResponse) {
			const cachedGlobalResponse = init[responseCache];
			if (cachedGlobalResponse) {
				this.#init = cachedGlobalResponse;
				this[getResponseCache]();
				return;
			}
			this.#init = init instanceof Response$1 ? init.#init : init;
			headers = new Headers(init.headers);
		} else this.#init = init;
		if (body == null || typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
			init?.status || 200,
			body ?? null,
			headers || init?.headers
		];
	}
	get headers() {
		const cache = this[cacheKey];
		if (cache) {
			if (!(cache[2] instanceof Headers)) cache[2] = new Headers(cache[2] || (cache[1] === null ? void 0 : { "content-type": defaultContentType }));
			return cache[2];
		}
		return this[getResponseCache]().headers;
	}
	get status() {
		return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
	}
	get ok() {
		const status = this.status;
		return status >= 200 && status < 300;
	}
};
[
	"body",
	"bodyUsed",
	"redirected",
	"statusText",
	"trailers",
	"type",
	"url"
].forEach((k) => {
	Object.defineProperty(Response$1.prototype, k, { get() {
		return this[getResponseCache]()[k];
	} });
});
[
	"arrayBuffer",
	"blob",
	"clone",
	"formData",
	"json",
	"text"
].forEach((k) => {
	Object.defineProperty(Response$1.prototype, k, { value: function() {
		return this[getResponseCache]()[k]();
	} });
});
Object.defineProperty(Response$1.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
	return `Response (lightweight) ${inspectFn({
		status: this.status,
		headers: this.headers,
		ok: this.ok,
		nativeResponse: this[responseCache]
	}, {
		...options,
		depth: depth == null ? null : depth - 1
	})}`;
} });
Object.setPrototypeOf(Response$1, GlobalResponse);
Object.setPrototypeOf(Response$1.prototype, GlobalResponse.prototype);
var validRedirectUrl = /^https?:\/\/[!#-;=?-[\]_a-z~A-Z]+$/;
var parseRedirectUrl = (url) => {
	if (url instanceof URL) return url.href;
	if (validRedirectUrl.test(url)) return url;
	return new URL(url).href;
};
var validRedirectStatuses = /* @__PURE__ */ new Set([
	301,
	302,
	303,
	307,
	308
]);
Object.defineProperty(Response$1, "redirect", {
	value: function redirect(url, status = 302) {
		if (!validRedirectStatuses.has(status)) throw new RangeError("Invalid status code");
		return new Response$1(null, {
			status,
			headers: { location: parseRedirectUrl(url) }
		});
	},
	writable: true,
	configurable: true
});
Object.defineProperty(Response$1, "json", {
	value: function json(data, init) {
		const body = JSON.stringify(data);
		if (body === void 0) throw new TypeError("The data is not JSON serializable");
		const initHeaders = init?.headers;
		let headers;
		if (initHeaders) {
			headers = new Headers(initHeaders);
			if (!headers.has("content-type")) headers.set("content-type", "application/json");
		} else headers = { "content-type": "application/json" };
		return new Response$1(body, {
			status: init?.status ?? 200,
			statusText: init?.statusText,
			headers
		});
	},
	writable: true,
	configurable: true
});
async function readWithoutBlocking(readPromise) {
	return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
	const cancel = (error) => {
		reader.cancel(error).catch(() => {});
	};
	writable.on("close", cancel);
	writable.on("error", cancel);
	(currentReadPromise ?? reader.read()).then(flow, handleStreamError);
	return reader.closed.finally(() => {
		writable.off("close", cancel);
		writable.off("error", cancel);
	});
	function handleStreamError(error) {
		if (error) writable.destroy(error);
	}
	function onDrain() {
		reader.read().then(flow, handleStreamError);
	}
	function flow({ done, value }) {
		try {
			if (done) writable.end();
			else if (!writable.write(value)) writable.once("drain", onDrain);
			else return reader.read().then(flow, handleStreamError);
		} catch (e) {
			handleStreamError(e);
		}
	}
}
function writeFromReadableStream(stream, writable) {
	if (stream.locked) throw new TypeError("ReadableStream is locked.");
	else if (writable.destroyed) return;
	return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers, defaultContentType) => {
	const res = {};
	if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
	if (headers.has("set-cookie")) {
		const cookies = [];
		for (const [k, v] of headers) if (k === "set-cookie") cookies.push(v);
		else res[k] = v;
		if (cookies.length > 0) res["set-cookie"] = cookies;
	} else for (const [k, v] of headers) res[k] = v;
	if (defaultContentType) res["content-type"] ??= defaultContentType;
	return res;
};
var outgoingEnded = Symbol("outgoingEnded");
var incomingDraining = Symbol("incomingDraining");
var DRAIN_TIMEOUT_MS = 500;
var MAX_DRAIN_BYTES = 67108864;
var drainIncoming = (incoming) => {
	const incomingWithDrainState = incoming;
	if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
	incomingWithDrainState[incomingDraining] = true;
	if (incoming instanceof Http2ServerRequest) {
		try {
			incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
		} catch {}
		return;
	}
	let bytesRead = 0;
	const cleanup = () => {
		clearTimeout(timer);
		incoming.off("data", onData);
		incoming.off("end", cleanup);
		incoming.off("error", cleanup);
	};
	const forceClose = () => {
		cleanup();
		const socket = incoming.socket;
		if (socket && !socket.destroyed) {
			if (typeof socket.destroySoon === "function") socket.destroySoon();
			else if (typeof socket.destroy === "function") socket.destroy();
		}
	};
	const timer = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
	timer.unref?.();
	const onData = (chunk) => {
		bytesRead += chunk.length;
		if (bytesRead > MAX_DRAIN_BYTES) forceClose();
	};
	incoming.on("data", onData);
	incoming.on("end", cleanup);
	incoming.on("error", cleanup);
	incoming.resume();
};
var makeCloseHandler = (req, incoming, outgoing, needsBodyCleanup) => () => {
	if (incoming.errored) {
		recordBodyBufferedBeforeDisconnect(incoming);
		req[abortRequest](incoming.errored.toString());
	} else if (!outgoing.writableFinished) {
		recordBodyBufferedBeforeDisconnect(incoming);
		req[abortRequest]("Client connection prematurely closed.");
	}
	if (needsBodyCleanup && !incoming.readableEnded) setTimeout(() => {
		if (!incoming.readableEnded) setTimeout(() => {
			drainIncoming(incoming);
		});
	});
};
var isImmediateCacheableResponse = (res) => {
	if (!(cacheKey in res)) return false;
	const body = res[cacheKey][1];
	return body === null || typeof body === "string" || body instanceof Uint8Array;
};
var handleRequestError = () => new Response(null, { status: 400 });
var handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
var handleResponseError = (e, outgoing) => {
	const err = e instanceof Error ? e : new Error("unknown error", { cause: e });
	if (err.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
	else {
		console.error(e);
		if (!outgoing.headersSent) {
			if (outgoing instanceof ServerResponse) outgoing._contentLength = null;
			outgoing.writeHead(500, { "Content-Type": "text/plain" });
		}
		outgoing.end(`Error: ${err.message}`);
		outgoing.destroy(err);
	}
};
var flushHeaders = (outgoing) => {
	if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
};
var trySetContentLength = (outgoing, status, length) => {
	const http1 = outgoing;
	if (http1._contentLength === null && http1._hasBody && http1.useChunkedEncodingByDefault && !http1._removedContLen && status >= 200 && status !== 204 && status !== 304 && !outgoing.hasHeader("content-length") && !outgoing.hasHeader("transfer-encoding") && !outgoing.hasHeader("trailer")) {
		http1._contentLength = length;
		return true;
	}
	return false;
};
var writeDefaultHeaders = (outgoing, status, length) => {
	if (trySetContentLength(outgoing, status, length)) outgoing.writeHead(status, { "Content-Type": defaultContentType });
	else outgoing.writeHead(status, {
		"Content-Type": defaultContentType,
		"Content-Length": length
	});
};
var responseViaCache = async (res, outgoing) => {
	let [status, body, header] = res[cacheKey];
	if (!header) {
		if (body === null) {
			outgoing.writeHead(status);
			outgoing.end();
		} else if (typeof body === "string") {
			writeDefaultHeaders(outgoing, status, Buffer.byteLength(body));
			outgoing.end(body);
		} else if (body instanceof Uint8Array) {
			writeDefaultHeaders(outgoing, status, body.byteLength);
			outgoing.end(body);
		} else if (body instanceof Blob) {
			writeDefaultHeaders(outgoing, status, body.size);
			outgoing.end(new Uint8Array(await body.arrayBuffer()));
		} else {
			outgoing.writeHead(status, { "Content-Type": defaultContentType });
			flushHeaders(outgoing);
			await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
		}
		outgoing[outgoingEnded]?.();
		return;
	}
	let hasContentLength = false;
	let plainHeaders = false;
	let canAutoLength = true;
	if (header instanceof Headers) {
		hasContentLength = header.has("content-length");
		header = buildOutgoingHttpHeaders(header, body === null ? void 0 : defaultContentType);
	} else if (Array.isArray(header)) {
		const headerObj = new Headers(header);
		hasContentLength = headerObj.has("content-length");
		header = buildOutgoingHttpHeaders(headerObj, body === null ? void 0 : defaultContentType);
	} else {
		plainHeaders = true;
		for (const key in header) {
			if (key.length === 14 && key.toLowerCase() === "content-length") {
				hasContentLength = true;
				break;
			}
			if (key.length === 17 && key.toLowerCase() === "transfer-encoding" || key.length === 7 && key.toLowerCase() === "trailer") canAutoLength = false;
		}
	}
	if (!hasContentLength) {
		let length;
		if (typeof body === "string") length = Buffer.byteLength(body);
		else if (body instanceof Uint8Array) length = body.byteLength;
		else if (body instanceof Blob) length = body.size;
		if (length !== void 0 && (!plainHeaders || !canAutoLength || !trySetContentLength(outgoing, status, length))) {
			if (plainHeaders) header = { ...header };
			header["Content-Length"] = length;
		}
	}
	outgoing.writeHead(status, header);
	if (body == null) outgoing.end();
	else if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
	else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
	else {
		flushHeaders(outgoing);
		await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
	}
	outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
	if (isPromise(res)) if (options.errorHandler) try {
		res = await res;
	} catch (err) {
		const errRes = await options.errorHandler(err);
		if (!errRes) return;
		res = errRes;
	}
	else res = await res.catch(handleFetchError);
	if (cacheKey in res) return responseViaCache(res, outgoing);
	const resHeaderRecord = buildOutgoingHttpHeaders(res.headers, res.body === null ? void 0 : defaultContentType);
	if (res.body) {
		const reader = res.body.getReader();
		const values = [];
		let done = false;
		let currentReadPromise = void 0;
		if (resHeaderRecord["transfer-encoding"] !== "chunked") {
			let maxReadCount = 2;
			for (let i = 0; i < maxReadCount; i++) {
				currentReadPromise ||= reader.read();
				const chunk = await readWithoutBlocking(currentReadPromise).catch((e) => {
					console.error(e);
					done = true;
				});
				if (!chunk) {
					if (i === 1) {
						await new Promise((resolve) => setTimeout(resolve));
						maxReadCount = 3;
						continue;
					}
					break;
				}
				currentReadPromise = void 0;
				if (chunk.value) values.push(chunk.value);
				if (chunk.done) {
					done = true;
					break;
				}
			}
			if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
		}
		outgoing.writeHead(res.status, resHeaderRecord);
		values.forEach((value) => {
			outgoing.write(value);
		});
		if (done) outgoing.end();
		else {
			if (values.length === 0) flushHeaders(outgoing);
			await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
		}
	} else if (resHeaderRecord["x-hono-already-sent"]) {} else {
		outgoing.writeHead(res.status, resHeaderRecord);
		outgoing.end();
	}
	outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
	const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
	if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
		Object.defineProperty(global, "Request", { value: Request$1 });
		Object.defineProperty(global, "Response", { value: Response$1 });
	}
	return async (incoming, outgoing) => {
		let res, req;
		let needsBodyCleanup = false;
		let closeHandlerAttached = false;
		const ensureCloseHandler = () => {
			if (!req || closeHandlerAttached) return;
			closeHandlerAttached = true;
			outgoing.on("close", makeCloseHandler(req, incoming, outgoing, needsBodyCleanup));
		};
		try {
			req = newRequest(incoming, options.hostname);
			needsBodyCleanup = autoCleanupIncoming && !(incoming.method === "GET" || incoming.method === "HEAD");
			if (needsBodyCleanup) {
				incoming[wrapBodyStream] = true;
				if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
					if (!incoming.readableEnded) setTimeout(() => {
						if (!incoming.readableEnded) setTimeout(() => {
							incoming.destroy();
							outgoing.destroy();
						});
					});
				};
			}
			res = fetchCallback(req, {
				incoming,
				outgoing
			});
			if (!isPromise(res) && isImmediateCacheableResponse(res)) {
				if (needsBodyCleanup && !incoming.readableEnded) outgoing.once("finish", () => {
					if (!incoming.readableEnded) drainIncoming(incoming);
				});
				return responseViaCache(res, outgoing);
			}
			ensureCloseHandler();
		} catch (e) {
			if (!res) if (options.errorHandler) {
				ensureCloseHandler();
				res = await options.errorHandler(req ? e : toRequestError(e));
				if (!res) return;
			} else if (!req) res = handleRequestError();
			else res = handleFetchError(e);
			else return handleResponseError(e, outgoing);
		}
		try {
			return await responseViaResponseObject(res, outgoing, options);
		} catch (e) {
			return handleResponseError(e, outgoing);
		}
	};
};
globalThis.CloseEvent;
globalThis.ErrorEvent;
var CONNECTION_SYMBOL_KEY = Symbol("CONNECTION_SYMBOL_KEY");
var WAIT_FOR_WEBSOCKET_SYMBOL = Symbol("WAIT_FOR_WEBSOCKET_SYMBOL");
var responseHeadersToSkip = /* @__PURE__ */ new Set([
	"connection",
	"content-length",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"sec-websocket-accept",
	"sec-websocket-extensions",
	"sec-websocket-protocol"
]);
var appendResponseHeaders = (headers, responseHeaders) => {
	if (!responseHeaders) return;
	responseHeaders.forEach((value, key) => {
		if (responseHeadersToSkip.has(key.toLowerCase())) return;
		headers.push(`${key}: ${value}`);
	});
};
var rejectUpgradeRequest = (socket, status, responseHeaders) => {
	const responseLines = ["Connection: close", "Content-Length: 0"];
	appendResponseHeaders(responseLines, responseHeaders);
	socket.end(`HTTP/1.1 ${status.toString()} ${STATUS_CODES[status] ?? ""}\r\n${responseLines.join("\r\n")}\r\n\r
`);
};
var createUpgradeRequest = (request) => {
	const protocol = request.socket.encrypted ? "https" : "http";
	const url = new URL(request.url ?? "/", `${protocol}://${request.headers.host ?? "localhost"}`);
	const headers = new Headers();
	for (const key in request.headers) {
		const value = request.headers[key];
		if (!value) continue;
		headers.append(key, Array.isArray(value) ? value[0] : value);
	}
	return new Request(url, { headers });
};
var setupWebSocket = (options) => {
	const { server, fetchCallback, wss } = options;
	const waiterMap = /* @__PURE__ */ new Map();
	wss.on("connection", (ws, request) => {
		const waiter = waiterMap.get(request);
		if (waiter) {
			waiter.resolve(ws);
			waiterMap.delete(request);
		}
	});
	const rejectWaiter = (request) => {
		const waiter = waiterMap.get(request);
		if (waiter) {
			waiterMap.delete(request);
			waiter.reject(/* @__PURE__ */ new Error("WebSocket handshake aborted"));
		}
	};
	const waitForWebSocket = (request, connectionSymbol) => {
		return new Promise((resolve, reject) => {
			waiterMap.set(request, {
				resolve,
				reject,
				connectionSymbol
			});
		});
	};
	server.on("upgrade", async (request, socket, head) => {
		if (request.headers.upgrade?.toLowerCase() !== "websocket") return;
		const env = {
			incoming: request,
			outgoing: void 0,
			wss,
			[WAIT_FOR_WEBSOCKET_SYMBOL]: waitForWebSocket
		};
		let status = 400;
		let responseHeaders;
		try {
			const response = await fetchCallback(createUpgradeRequest(request), env);
			if (response instanceof Response) {
				status = response.status;
				responseHeaders = response.headers;
			}
		} catch {
			if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, 500);
			return;
		}
		const waiter = waiterMap.get(request);
		if (!waiter || waiter.connectionSymbol !== env[CONNECTION_SYMBOL_KEY]) {
			rejectWaiter(request);
			if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, status, responseHeaders);
			return;
		}
		const addResponseHeaders = (headers) => {
			appendResponseHeaders(headers, responseHeaders);
		};
		const reclaimWaiterOnClose = () => rejectWaiter(request);
		socket.once("close", reclaimWaiterOnClose);
		wss.on("headers", addResponseHeaders);
		try {
			wss.handleUpgrade(request, socket, head, (ws) => {
				socket.off("close", reclaimWaiterOnClose);
				wss.emit("connection", ws, request);
			});
		} finally {
			wss.off("headers", addResponseHeaders);
		}
	});
	server.on("close", () => {
		wss.close();
	});
};
var createAdaptorServer = (options) => {
	const fetchCallback = options.fetch;
	const requestListener = getRequestListener(fetchCallback, {
		hostname: options.hostname,
		overrideGlobalObjects: options.overrideGlobalObjects,
		autoCleanupIncoming: options.autoCleanupIncoming
	});
	const server = (options.createServer || createServer)(options.serverOptions || {}, requestListener);
	if (options.websocket && options.websocket.server) {
		if (options.websocket.server.options.noServer !== true) throw new Error("WebSocket server must be created with { noServer: true } option");
		setupWebSocket({
			server,
			fetchCallback,
			wss: options.websocket.server
		});
	}
	return server;
};
var serve = (options, listeningListener) => {
	const server = createAdaptorServer(options);
	server.listen(options?.port ?? 3e3, options.hostname, () => {
		const serverInfo = server.address();
		listeningListener && listeningListener(serverInfo);
	});
	return server;
};
//#endregion
//#region ../../node_modules/.pnpm/@hono+node-server@2.1.4_hono@4.13.13/node_modules/@hono/node-server/dist/utils/stream.mjs
var pr54206Applied = () => {
	const [major, minor] = versions.node.split(".").map((component) => parseInt(component));
	return major >= 23 || major === 22 && minor >= 7 || major === 20 && minor >= 18;
};
var useReadableToWeb = pr54206Applied();
var createStreamBody = (stream, useNativeReadableToWeb = useReadableToWeb) => {
	if (useNativeReadableToWeb) return Readable.toWeb(stream);
	let controller;
	let settled = false;
	const cleanup = () => {
		stream.off("data", onData);
		stream.off("error", onError);
		stream.off("end", onTerminate);
		stream.off("close", onTerminate);
	};
	const settle = (callback) => {
		if (settled) return;
		settled = true;
		cleanup();
		callback?.();
	};
	const onData = (chunk) => {
		if (settled || !controller) return;
		controller.enqueue(chunk);
		if ((controller.desiredSize ?? 0) <= 0) stream.pause();
	};
	const onError = (error) => {
		settle(() => {
			controller?.error(error);
		});
	};
	const onTerminate = () => {
		settle(() => {
			controller?.close();
		});
	};
	return new ReadableStream({
		start(streamController) {
			controller = streamController;
			stream.on("data", onData);
			stream.on("error", onError);
			stream.on("end", onTerminate);
			stream.on("close", onTerminate);
			stream.pause();
		},
		pull() {
			if (!settled) stream.resume();
		},
		cancel() {
			settle();
			const ignoreError = () => {};
			stream.on("error", ignoreError);
			stream.once("close", () => stream.off("error", ignoreError));
			stream.destroy();
		}
	});
};
//#endregion
//#region ../../node_modules/.pnpm/hono@4.13.13/node_modules/hono/dist/utils/mime.js
/**
* @module
* MIME utility.
*/
var getMimeType = (filename, mimes = baseMimes) => {
	const match = filename.match(/\.([a-zA-Z0-9]+?)$/);
	if (!match) return;
	return mimes[match[1].toLowerCase()];
};
var baseMimes = {
	aac: "audio/aac",
	avi: "video/x-msvideo",
	avif: "image/avif",
	av1: "video/av1",
	bin: "application/octet-stream",
	bmp: "image/bmp",
	css: "text/css; charset=utf-8",
	csv: "text/csv; charset=utf-8",
	eot: "application/vnd.ms-fontobject",
	epub: "application/epub+zip",
	gif: "image/gif",
	gz: "application/gzip",
	htm: "text/html; charset=utf-8",
	html: "text/html; charset=utf-8",
	ico: "image/x-icon",
	ics: "text/calendar; charset=utf-8",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	js: "text/javascript; charset=utf-8",
	json: "application/json",
	jsonld: "application/ld+json",
	map: "application/json",
	mid: "audio/x-midi",
	midi: "audio/x-midi",
	mjs: "text/javascript; charset=utf-8",
	mp3: "audio/mpeg",
	mp4: "video/mp4",
	mpeg: "video/mpeg",
	oga: "audio/ogg",
	ogv: "video/ogg",
	ogx: "application/ogg",
	opus: "audio/opus",
	otf: "font/otf",
	pdf: "application/pdf",
	png: "image/png",
	rtf: "application/rtf",
	svg: "image/svg+xml; charset=utf-8",
	tif: "image/tiff",
	tiff: "image/tiff",
	ts: "video/mp2t",
	ttf: "font/ttf",
	txt: "text/plain; charset=utf-8",
	wasm: "application/wasm",
	webm: "video/webm",
	weba: "audio/webm",
	webmanifest: "application/manifest+json",
	webp: "image/webp",
	woff: "font/woff",
	woff2: "font/woff2",
	xhtml: "application/xhtml+xml; charset=utf-8",
	xml: "application/xml; charset=utf-8",
	zip: "application/zip",
	"3gp": "video/3gpp",
	"3g2": "video/3gpp2",
	gltf: "model/gltf+json",
	glb: "model/gltf-binary"
};
//#endregion
//#region ../../node_modules/.pnpm/@hono+node-server@2.1.4_hono@4.13.13/node_modules/@hono/node-server/dist/serve-static.mjs
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|wasm|x-httpd-php|x-javascript|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml))(?:[;\s]|$)/i;
var ENCODINGS = {
	br: ".br",
	zstd: ".zst",
	gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var getStats = (path) => {
	let stats;
	try {
		stats = statSync(path);
	} catch {}
	return stats;
};
var BYTE_RANGE_PATTERN = /^(?:bytes=)?(?!-$)(\d*)-(\d*)$/;
var parseByteRange = (range) => {
	const match = range.match(BYTE_RANGE_PATTERN);
	if (!match) return;
	const [, start, end] = match;
	if (start === "") return {
		type: "suffix",
		length: Number(end)
	};
	if (end === "") return {
		type: "open-ended",
		start: Number(start)
	};
	return {
		type: "bounded",
		start: Number(start),
		end: Number(end)
	};
};
var resolveByteRange = (spec, size) => {
	if (size === 0) return;
	if (spec.type === "suffix") {
		if (spec.length === 0) return;
		return {
			start: Math.max(size - spec.length, 0),
			end: size - 1
		};
	}
	const end = spec.type === "bounded" ? Math.min(spec.end, size - 1) : size - 1;
	if (spec.start >= size || spec.start > end) return;
	return {
		start: spec.start,
		end
	};
};
var tryDecode = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var serveStatic = (options = { root: "" }) => {
	const root = options.root || "";
	const optionPath = options.path;
	if (root !== "" && !existsSync(root)) console.error(`serveStatic: root path '${root}' is not found, are you sure it's correct?`);
	return async (c, next) => {
		if (c.finalized) return next();
		let filename;
		if (optionPath) filename = optionPath;
		else try {
			if (!options.allowPercentInPath && c.req.path.includes("%")) throw new Error();
			filename = tryDecodeURI(c.req.path);
			if (/(?:^|[\/\\])\.{1,2}(?:$|[\/\\])|[\/\\]{2,}|\\/.test(filename)) throw new Error();
		} catch {
			await options.onNotFound?.(c.req.path, c);
			return next();
		}
		let path = join(root, !optionPath && options.rewriteRequestPath ? options.rewriteRequestPath(filename, c) : filename);
		let stats = getStats(path);
		if (stats && stats.isDirectory()) {
			const indexFile = options.index ?? "index.html";
			path = join(path, indexFile);
			stats = getStats(path);
		}
		if (!stats) {
			await options.onNotFound?.(path, c);
			return next();
		}
		const mimeType = getMimeType(path);
		c.header("Content-Type", mimeType || "application/octet-stream");
		if (options.precompressed && (!mimeType || mimeType === "application/octet-stream" || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
			const acceptEncodingSet = new Set(c.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim()));
			for (const encoding of ENCODINGS_ORDERED_KEYS) {
				if (!acceptEncodingSet.has(encoding)) continue;
				const precompressedStats = getStats(path + ENCODINGS[encoding]);
				if (precompressedStats) {
					c.header("Content-Encoding", encoding);
					c.header("Vary", "Accept-Encoding", { append: true });
					stats = precompressedStats;
					path = path + ENCODINGS[encoding];
					break;
				}
			}
		}
		let result;
		const size = stats.size;
		const range = c.req.header("range") || "";
		c.header("Last-Modified", stats.mtime.toUTCString());
		if (c.req.method == "HEAD" || c.req.method == "OPTIONS") {
			c.header("Content-Length", size.toString());
			c.status(200);
			result = c.body(null);
		} else if (!range) {
			c.header("Content-Length", size.toString());
			result = c.body(createStreamBody(createReadStream(path)), 200);
		} else {
			c.header("Accept-Ranges", "bytes");
			const resolvedRange = resolveByteRange(parseByteRange(range) ?? {
				type: "open-ended",
				start: 0
			}, size);
			if (!resolvedRange) {
				c.header("Content-Range", `bytes */${size}`);
				result = c.body(null, 416);
			} else {
				const { start, end } = resolvedRange;
				const chunkSize = end - start + 1;
				const stream = createReadStream(path, {
					start,
					end
				});
				c.header("Content-Length", chunkSize.toString());
				c.header("Content-Range", `bytes ${start}-${end}/${size}`);
				result = c.body(createStreamBody(stream), 206);
			}
		}
		await options.onFound?.(path, c);
		return result;
	};
};
//#endregion
//#region server.ts
init_dist$2();
/** Public files are always next to the server entry, including after deployment. */
var publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), "public");
var app$1 = new Hono();
app$1.use("*", async (c, next) => {
	c.header("x-powered-by", "Hum + Hono");
	await next();
});
if (existsSync(publicRoot)) app$1.use("*", serveStatic({ root: publicRoot }));
app$1.get("/api/health", (c) => c.json({ status: "ok" }));
/**
* The build's entry point: Hum calls it once its file routes are mounted, which
* is what `pnpm start` runs. A deployment handed to a platform that calls
* `fetch` itself omits it, and the build exports the app instead.
*/
function start(app) {
	const port = Number(process.env.PORT ?? 3e3);
	const hostname = process.env.HOST ?? "0.0.0.0";
	serve({
		fetch: app.fetch,
		port,
		hostname,
		overrideGlobalObjects: false
	}, (info) => {
		console.log(`hum: listening on http://localhost:${info.port}`);
	});
}
//#endregion
//#region .hum/server-entry.js
init_dist();
var humConfig = {
	routesDir: "routes",
	islandsDir: "islands",
	dev: false
};
var app = app$1;
await mountHum(app, humConfig);
if (typeof start === "function") await start(app);
//#endregion
export { app as default };
