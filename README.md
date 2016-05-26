fis3-packager-map
=====================


fis3 中内嵌的打包工具。


## 配置方式

$ vi path/to/project/fis-conf.js

```javascript
fis.match('*.css', {
  packTo: '/pkg/all.css'
});

fis.match('*.js', {
  packTo: '/pkg/all.js'
});
```

或者：

```js
fis.match('::package', {
  packager: fis.plugin('map', {
    'pkg/all.js': [
      'libs/*.js',
      'widget/*.js'
    ]
  })
})
```
{'pkg/xxx': [...], ...} 的格式也可用于 fis.set("pack", ) 或 fis-pack.json 来设置。
```
规则优先级：

通过插件配置 > fis.set("pack", ) > fis-pack.json > match( , {`packTo`})

## 关闭输出路径信息

默认打包后输出路径信息,便于调试.形式如下

```js
/*!/components/underscore/underscore.js*/
```

可以在插件的配置中关闭路径信息输出

```js
fis.match('::package', {
  packager: fis.plugin('map', {
    useTrack : false, // 是否输出路径信息,默认为 true
    'pkg/all.js': [
       'libs/*.js',
       'widget/*.js'
    ]
  })
})
```

