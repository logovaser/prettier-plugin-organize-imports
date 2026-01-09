const {
	detectNextJs,
	findProjectRoot,
	loadConfig,
	findConfigFile,
	convertToAbsolutePath,
	resolveRelativePath,
} = require('./path-resolver');

/**
 * Calculates the depth of a relative path (number of ../ segments)
 */
function calculateRelativeDepth(importPath) {
	if (!importPath.startsWith('.')) {
		return 0; // Not a relative path
	}

	const parts = importPath.split('/');
	let depth = 0;

	for (const part of parts) {
		if (part === '..') {
			depth++;
		} else if (part === '.') {
			// Current directory, doesn't add depth
		} else {
			break; // Reached the actual path
		}
	}

	return depth;
}

/**
 * Checks if an import path should be transformed
 */
function shouldTransform(importPath, maxRelativePathDepth) {
	const depth = calculateRelativeDepth(importPath);
	return depth > maxRelativePathDepth;
}

/**
 * Transforms import paths in source text
 * Only processes import/require statements in the imports section (top of file)
 */
function transformText(text, filePath, options = {}) {
	const {
		absolutePathPrefix = '@/',
		maxRelativePathDepth = 1,
		tsconfigPath,
		nextjsMode,
	} = options;

	// Find project root
	const projectRoot = findProjectRoot(filePath);

	// Detect Next.js if not explicitly set
	const isNextJs =
		nextjsMode === true
			? true
			: nextjsMode === false
				? false
				: detectNextJs(projectRoot);

	// Load config
	let config = null;
	if (tsconfigPath && tsconfigPath.trim()) {
		config = loadConfig(tsconfigPath);
	} else {
		const configFile = findConfigFile(projectRoot);
		if (configFile) {
			config = loadConfig(configFile.path);
		}
	}

	// Split text into lines for processing
	const lines = text.split('\n');
	const transformedLines = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();

		if (trimmedLine.startsWith('import ')) {
			// Process this line for transformations
			let transformedLine = line;

			// Try to match and transform import statements
			// This regex handles various import formats including type imports
			const importMatch = line.match(
				/^(\s*)import\s+((?:type\s+)?(?:\*\s+as\s+\w+|\{[^}]*\}|\w+)?)\s+from\s+["']([^"']+)["'](;?)$/,
			);
			if (importMatch) {
				const [, leadingWhitespace, importClause, importPath, semicolon] = importMatch;

				if (shouldTransform(importPath, maxRelativePathDepth)) {
					try {
						const resolvedPath = resolveRelativePath(importPath, filePath);
						const absoluteImportPath = convertToAbsolutePath(
							resolvedPath,
							projectRoot,
							config,
							absolutePathPrefix,
							isNextJs,
						);

						if (absoluteImportPath) {
							const quote = line.includes('"' + importPath + '"') ? '"' : "'";
							transformedLine = `${leadingWhitespace}import ${importClause} from ${quote}${absoluteImportPath}${quote}${semicolon}`;
						}
					} catch (e) {
						if (process.env.DEBUG) {
							console.warn(`Failed to transform import: ${importPath}`, e.message);
						}
					}
				}
			}

			transformedLines.push(transformedLine);
		} else if (trimmedLine === '' || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
			transformedLines.push(line);
		} else {
			transformedLines.push(line);
		}
	}

	return transformedLines.join('\n');
}

module.exports = {
	calculateRelativeDepth,
	shouldTransform,
	transformText,
};

