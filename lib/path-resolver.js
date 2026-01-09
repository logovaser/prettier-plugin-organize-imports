const fs = require('fs');
const path = require('path');
const { existsSync } = require('fs');

/**
 * Detects if the project is a Next.js project
 */
function detectNextJs(projectRoot) {
	const packageJsonPath = path.join(projectRoot, 'package.json');
	const nextConfigPath = path.join(projectRoot, 'next.config.js');
	const nextConfigMjsPath = path.join(projectRoot, 'next.config.mjs');
	const nextConfigTsPath = path.join(projectRoot, 'next.config.ts');

	if (existsSync(nextConfigPath) || existsSync(nextConfigMjsPath) || existsSync(nextConfigTsPath)) {
		return true;
	}

	if (existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			const deps = {
				...(packageJson.dependencies || {}),
				...(packageJson.devDependencies || {}),
			};
			return !!deps.next;
		} catch (e) {
			// Ignore errors
		}
	}

	return false;
}

/**
 * Finds the project root by looking for package.json, tsconfig.json, or jsconfig.json
 */
function findProjectRoot(filePath) {
	let currentDir = path.dirname(filePath);
	const root = path.parse(filePath).root;

	while (currentDir !== root) {
		const packageJson = path.join(currentDir, 'package.json');
		const tsconfig = path.join(currentDir, 'tsconfig.json');
		const jsconfig = path.join(currentDir, 'jsconfig.json');

		if (existsSync(packageJson) || existsSync(tsconfig) || existsSync(jsconfig)) {
			return currentDir;
		}

		currentDir = path.dirname(currentDir);
	}

	return path.dirname(filePath);
}

/**
 * Loads and parses tsconfig.json or jsconfig.json
 */
function loadConfig(configPath) {
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(configPath, 'utf8');
		// Remove comments (simple approach)
		const cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
		return JSON.parse(cleaned);
	} catch (e) {
		return null;
	}
}

/**
 * Finds tsconfig.json or jsconfig.json
 */
function findConfigFile(projectRoot) {
	const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
	const jsconfigPath = path.join(projectRoot, 'jsconfig.json');

	if (existsSync(tsconfigPath)) {
		return { path: tsconfigPath, type: 'tsconfig' };
	}
	if (existsSync(jsconfigPath)) {
		return { path: jsconfigPath, type: 'jsconfig' };
	}

	return null;
}

/**
 * Resolves a path using tsconfig/jsconfig path mappings
 */
function resolvePathMapping(absolutePath, projectRoot, config) {
	if (!config || !config.compilerOptions) {
		return null;
	}

	const { baseUrl = '.', paths = {} } = config.compilerOptions;
	const basePath = path.resolve(projectRoot, baseUrl);
	const relativePath = path.relative(basePath, absolutePath);
	const normalizedRelative = relativePath.replace(/\\/g, '/');

	// Try to match against path mappings
	for (const [pattern, mappings] of Object.entries(paths)) {
		const patternRegex = new RegExp('^' + pattern.replace(/\*/g, '(.+)') + '$');

		for (const mapping of Array.isArray(mappings) ? mappings : [mappings]) {
			const mappingPath = path.resolve(basePath, mapping.replace(/\*/g, ''));
			const mappingRelative = path.relative(basePath, mappingPath);
			const normalizedMapping = mappingRelative.replace(/\\/g, '/');

			if (normalizedRelative.startsWith(normalizedMapping)) {
				const rest = normalizedRelative.slice(normalizedMapping.length);
				const match = pattern.replace(/\*/g, rest);
				return match;
			}
		}
	}

	return null;
}

/**
 * Converts an absolute path to a path with the configured prefix
 */
function convertToAbsolutePath(absolutePath, projectRoot, config, absolutePathPrefix, isNextJs) {
	// Try to use path mappings first
	const mappedPath = resolvePathMapping(absolutePath, projectRoot, config);
	if (mappedPath) {
		return mappedPath;
	}

	// Fallback: use baseUrl and prefix
	const baseUrl = config?.compilerOptions?.baseUrl || '.';
	const basePath = path.resolve(projectRoot, baseUrl);
	let relativePath = path.relative(basePath, absolutePath);

	// Normalize path separators
	const normalized = relativePath.replace(/\\/g, '/');

	// If the path still goes outside the project (starts with ..),
	// it means the file doesn't exist within the project structure
	// Try to extract just the filename part that should be within the project
	let finalPath = normalized;
	if (normalized.startsWith('..')) {
		// The path goes outside - this shouldn't happen in a well-structured project
		// But we'll try to be helpful: if we can find a valid path segment, use it
		const pathParts = normalized.split('/');
		const firstNonParent = pathParts.findIndex((part) => part !== '..' && part !== '.');
		if (firstNonParent > 0) {
			// Take everything from the first non-parent directory onward
			finalPath = pathParts.slice(firstNonParent).join('/');
		} else {
			// Can't convert this path safely
			return null;
		}
	}

	// Remove file extension for cleaner imports
	const withoutExt = finalPath.replace(/\.(js|jsx|ts|tsx|vue)$/, '');

	// In Next.js, if prefix is @/, it typically maps to root
	if (isNextJs && absolutePathPrefix === '@/') {
		return absolutePathPrefix + withoutExt;
	}

	return absolutePathPrefix + withoutExt;
}

/**
 * Resolves a relative import path to an absolute file path
 */
function resolveRelativePath(relativePath, currentFilePath) {
	const currentDir = path.dirname(currentFilePath);
	const resolved = path.resolve(currentDir, relativePath);

	// Try different extensions
	const extensions = [
		'',
		'.js',
		'.jsx',
		'.ts',
		'.tsx',
		'.vue',
		'/index.js',
		'/index.jsx',
		'/index.ts',
		'/index.tsx',
	];

	for (const ext of extensions) {
		const withExt = resolved + ext;
		if (existsSync(withExt) && fs.statSync(withExt).isFile()) {
			return withExt;
		}
	}

	// If it's a directory, try index files
	if (existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
		for (const ext of ['.js', '.jsx', '.ts', '.tsx']) {
			const indexFile = path.join(resolved, 'index' + ext);
			if (existsSync(indexFile)) {
				return indexFile;
			}
		}
	}

	// Return the resolved path even if file doesn't exist (for cases where file will be created)
	return resolved;
}

module.exports = {
	detectNextJs,
	findProjectRoot,
	loadConfig,
	findConfigFile,
	convertToAbsolutePath,
	resolveRelativePath,
};

