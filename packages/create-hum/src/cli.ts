import { DEFAULT_TEMPLATE } from "./scaffold.js";

/** What the command line asked for. */
export type CliCommand =
  | { kind: "scaffold"; target: string; template: string }
  | { kind: "list" }
  | { kind: "help" }
  | { kind: "none" };

const TEMPLATE_FLAGS = ["--template", "-t"];

/**
 * Reads the arguments of `create-hum <directory> [--template <name>]`, plus
 * `--list` and `--help`.
 *
 * The template name is not checked here: what exists is the file system's
 * answer, and it is checked while scaffolding, so `--list` and that check
 * cannot disagree. An unknown option is an error instead of being ignored,
 * because ignoring a misspelled `--template` scaffolds a project nobody asked
 * for.
 */
export function parseArgs(argv: string[]): CliCommand {
  let target: string | undefined;
  let template: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--list") return { kind: "list" };

    const inlineFlag = TEMPLATE_FLAGS.find((flag) => arg.startsWith(`${flag}=`));
    if (inlineFlag !== undefined) {
      const value = arg.slice(inlineFlag.length + 1);
      if (value === "") {
        throw new Error(`${inlineFlag} needs a template name.`);
      }
      template = value;
      continue;
    }

    if (TEMPLATE_FLAGS.includes(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`${arg} needs a template name.`);
      }
      template = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`unknown option "${arg}".`);
    }

    if (target !== undefined) {
      throw new Error(`unexpected argument "${arg}".`);
    }
    target = arg;
  }

  if (target === undefined) return { kind: "none" };
  return { kind: "scaffold", target, template: template ?? DEFAULT_TEMPLATE };
}
