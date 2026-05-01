const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// watch all workspace packages
config.watchFolders = [workspaceRoot];

// deduplicate React/React Native singletons across workspace
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;