/**
 * Scan UI-facing source for hardcoded Japanese in string literals.
 *
 * Usage:
 *   npm run i18n:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET_DIRS = ["src/app", "src/features"].map((dir) =>
  path.join(ROOT, dir),
);

const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_LINE_RE = /i18n-check-ignore/;
const CONSOLE_CALL_RE = /console\.(log|error|warn|info|debug)\s*\(/;
const LOCALE_METADATA_RE = /^\s*(ja|en)\s*:\s*["'`]/;
const IGNORE_FILES = new Set([
  "src/app/_constants/workspace-default-content.ts",
]);

type Finding = {
  file: string;
  line: number;
  text: string;
};

function walkDir(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "api" || entry === "_utils" || entry === "_hooks") {
        continue;
      }
      walkDir(fullPath, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

function extractStringLiterals(line: string): string[] {
  const literals: string[] = [];
  const patterns = [
    /'([^'\\]|\\.)*'/g,
    /"([^"\\]|\\.)*"/g,
    /`([^`\\]|\\.)*`/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      literals.push(match[0]);
    }
  }

  return literals;
}

function scanFile(filePath: string): Finding[] {
  const relativePath = path.relative(ROOT, filePath);
  if (IGNORE_FILES.has(relativePath)) {
    return [];
  }
  const source = stripBlockComments(readFileSync(filePath, "utf8"));
  const findings: Finding[] = [];

  source.split("\n").forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (IGNORE_LINE_RE.test(rawLine) || LOCALE_METADATA_RE.test(rawLine)) {
      return;
    }
    if (CONSOLE_CALL_RE.test(rawLine)) {
      return;
    }

    const withoutJsxComment = rawLine.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const codePart = withoutJsxComment.replace(/\/\/.*$/, "").trim();
    if (!codePart) {
      return;
    }

    for (const literal of extractStringLiterals(codePart)) {
      if (JAPANESE_RE.test(literal)) {
        findings.push({
          file: relativePath,
          line: lineNumber,
          text: literal.length > 80 ? `${literal.slice(0, 77)}...` : literal,
        });
      }
    }
  });

  return findings;
}

function main() {
  const files = TARGET_DIRS.flatMap((dir) => walkDir(dir));
  const findings = files.flatMap(scanFile);

  if (findings.length === 0) {
    console.log("No hardcoded Japanese string literals found.");
    return;
  }

  console.error(
    `Found ${findings.length} hardcoded Japanese string literal(s):\n`,
  );
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.text}`);
  }
  process.exit(1);
}

main();
