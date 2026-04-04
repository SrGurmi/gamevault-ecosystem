const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Ver todos los archivos del monorepo
config.watchFolders = [workspaceRoot];

// 2. Forzar a Metro a usar solo una copia de React y React Native (Singletons)
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;