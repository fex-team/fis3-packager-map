/**
 * 打包插件。用法：
 *
 * fis.match('*.js', {
 *   packTo: 'pkg/all.js'
 * });
 *
 * 或者：
 * fis-pack.json
 * {
 *   '/pkg/all.js': '*.js'， ...
 * }
 * 或者：
 *
 * fis.set('pack', {
 *   '/pkg/all.js': '*.js'
 * });
 */
var SourceMap = require('source-map');
var rSourceMap = /\/\/\#\s*sourceMappingURL[^\r\n]*(?:\r?\n|$)/i;
var path = require('path');
var _ = fis.util;

module.exports = function (ret, pack, settings, opt) {
	var fromSettings = false;

	// 是否添加调试信息
	var useTrack = true;

	if (_.has(settings, 'useTrack')) {
		useTrack = settings.useTrack;
		delete settings.useTrack;
	}

	if (settings && Object.keys(settings).length) {
		fromSettings = true;
		pack = settings;
	}

	var src = ret.src;
	var sources = [];
	var packed = {}; // cache all packed resource.
	var ns = fis.config.get('namespace');
	var connector = fis.config.get('namespaceConnector', ':');
	var root = fis.project.getProjectPath(),
	  sourceNode = new SourceMap.SourceNode();

	// 生成数组
	Object.keys(src).forEach(function (key) {
		sources.push(src[key]);
	});

	function find(reg, rExt) {
		if (src[reg]) {
			return [src[reg]];
		} else if (reg === '**') {
			// do nothing
		} else if (typeof reg === 'string') {
			reg = _.glob(reg);
		}

		return sources.filter(function (file) {
			reg.lastIndex = 0;
			return (reg === '**' || reg.test(file.subpath)) && (!rExt || file.rExt === rExt);
		});
	}

	Object.keys(pack).forEach(function (subpath, index) {
		var patterns = pack[subpath];

		if (!Array.isArray(patterns)) {
			patterns = [patterns];
		}

		var pid = (ns ? ns + connector : '') + 'p' + index;
		var pkg = fis.file.wrap(path.join(root, subpath));

		if (typeof ret.src[pkg.subpath] !== 'undefined') {
			fis.log.warning('there is a namesake file of package [' + subpath + ']');
		}

		var list = [];

		patterns.forEach(function (pattern, index) {
			var exclude = typeof pattern === 'string' && pattern.substring(0, 1) === '!';

			if (exclude) {
				pattern = pattern.substring(1);

				// 如果第一个规则就是排除用法，都没有获取结果就排除，这是不合理的用法。
				// 不过为了保证程序的正确性，在排除之前，通过 `**` 先把所有文件获取到。
				// 至于性能问题，请用户使用时规避。
				index === 0 && (list = find('**'));
			}

			var mathes = find(pattern, pkg.rExt);
			list = _[exclude ? 'difference' : 'union'](list, mathes);
		});

		// fix https://github.com/fex-team/fis3-packager-map/issues/4
		var originOrder = list.concat();

		// 根据 packOrder 排序
		fromSettings || (list = list.sort(function (a, b) {
			var a1 = a.packOrder >> 0;
			var b1 = b.packOrder >> 0;

			if (a1 === b1) {
				return originOrder.indexOf(a) - originOrder.indexOf(b);
			}

			return a1 - b1;
		}));

		// sort by dependency
		var filtered = [];
		while (list.length) {
			add(list.shift());
		}

		function add(file) {
			if (file.requires) {
				file.requires.forEach(function (id) {
					var dep = ret.ids[id];
					var idx;
					if (dep && dep.rExt === pkg.rExt && ~(idx = list.indexOf(dep))) {
						add(list.splice(idx, 1)[0]);
					}
				});
			}

			if (!packed[file.subpath] && file.rExt === pkg.rExt) {
				packed[file.subpath] = true;
				filtered.push(file);
			}
		}

		var content = '';
		var has = [];
		var requires = [];
		var requireMap = {}, hasSourceMap = false;

		filtered.forEach(function (file) {
			var id = file.getId(),
			prefix = useTrack ? ('/*!' + file.id + '*/\n') : ''; // either js or css
			if (file.isJsLike)
				prefix = ';' + prefix;

			if (ret.map.res[id]) {
				var c = file.getContent();

				// 派送事件
				var message = {
					file: file,
					content: c,
					pkg: pkg
				};
				fis.emit('pack:file', message);
				c = message.content;

				if (content) prefix = '\n' + prefix;

				if (sourceNode) {
					c = c.replace(rSourceMap, '');

					sourceNode.add(prefix);

					var mapFile = getMapFile(file);
					if (mapFile) {
						var json = JSON.parse(mapFile.getContent());
						var smc = new SourceMap.SourceMapConsumer(json);

						sourceNode.add(SourceMap.SourceNode.fromStringWithSourceMap(c, smc));
						// mapFile.release = false;
						// here? hasSourceMap = true;
					} else {
						sourceNode.add(c);
					}
					hasSourceMap = true;
				}
				else if (file.isCssLike && c) // cant remove code if sourceNode
					c = c.replace(/@charset\s+(?:'[^']*'|"[^"]*"|\S*);?/gi, '');

				content += prefix + c;

				ret.map.res[id].pkg = pid;
				requires = requires.concat(file.requires);
				requireMap[id] = true;
				has.push(id);
			}
		});

		if (has.length) {
			if (hasSourceMap) {
				var mapping = fis.file.wrap(pkg.dirname + '/' + pkg.filename + pkg.rExt + '.map');
				var code_map = sourceNode.toStringWithSourceMap({
					file: pkg.subpath
				});

				var generater = SourceMap.SourceMapGenerator.fromSourceMap(new SourceMap.SourceMapConsumer(code_map.map.toJSON()));
				mapping.setContent(generater.toString());

				ret.pkg[mapping.subpath] = mapping;
				content += '//# sourceMappingURL=' + mapping.getUrl();
			}

			pkg.setContent(content);
			ret.pkg[pkg.subpath] = pkg;

			// collect dependencies
			var deps = [];
			requires.forEach(function (id) {
				if (!requireMap[id]) {
					deps.push(id);
					requireMap[id] = true;
				}
			});
			var pkgInfo = ret.map.pkg[pid] = {
				uri: pkg.getUrl(opt.hash, opt.domain),
				type: pkg.rExt.replace(/^\./, ''),
				has: has
			};
			if (deps.length) {
				pkgInfo.deps = deps;
			}
		}
	});
};

function getMapFile(file) {
	// 同时修改 sourcemap 文件内容。
	var derived = file.derived;
	if (!derived || !derived.length) {
		derived = file.extras && file.extras.derived;
	}

	if (derived && derived[0] && derived[0].rExt === '.map') {
		return derived[0];
	}

	return null;
}
