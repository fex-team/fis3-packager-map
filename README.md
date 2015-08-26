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

通过插件配置的规则优先于 `packTo`。
