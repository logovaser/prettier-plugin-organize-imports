const { sep, posix } = require('path');
const { applyTextChanges } = require('./apply-text-changes');
const { getLanguageService } = require('./get-language-service');
const { transformText } = require('./transform-relative-imports');

/**
 * Organize the given code's imports.
 *
 * @param {string} code
 * @param {import('prettier').ParserOptions} options
 */
module.exports.organize = (
	code,
	{
		filepath = 'file.ts',
		organizeImportsSkipDestructiveCodeActions,
		parentParser,
		parser,
		organizeImportsTypeOrder,
		absolutePathPrefix,
		maxRelativePathDepth,
		tsconfigPath,
		nextjsMode,
	},
) => {
	if (parentParser === 'vue') {
		// we already did the preprocessing in the parent parser, so we skip the child parsers
		return code;
	}

	// Preserve original filepath for path resolution
	const originalFilepath = filepath;
	// Convert to posix for TypeScript language service
	const posixFilepath = sep !== posix.sep ? filepath.split(sep).join(posix.sep) : filepath;

	const languageService = getLanguageService(parser, posixFilepath, code);

	const fileChanges = languageService.organizeImports(
		{ type: 'file', fileName: posixFilepath, skipDestructiveCodeActions: organizeImportsSkipDestructiveCodeActions },
		{},
		{ organizeImportsTypeOrder },
	)[0];

	let organizedCode = fileChanges ? applyTextChanges(code, fileChanges.textChanges) : code;

	// Transform relative imports to absolute paths if enabled
	// Only transform if at least one option is explicitly provided
	if (
		absolutePathPrefix !== undefined ||
		maxRelativePathDepth !== undefined ||
		tsconfigPath !== undefined ||
		nextjsMode !== undefined
	) {
		organizedCode = transformText(organizedCode, originalFilepath, {
			absolutePathPrefix,
			maxRelativePathDepth,
			tsconfigPath,
			nextjsMode,
		});
	}

	return organizedCode;
};
