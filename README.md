# [https://github.com/Yonsm/ZhiDash](https://github.com/Yonsm/ZhiDash) - 智家面板

Yet Another Dashboard for HomeAssiatant

`ZhiDash` 是为 Home Assistant 开发操作面板，使用 WebSocket API 作为数据通道，基于非常简单的 HTML+JS+CSS 渲染而成的高效、快速的操控面板。可完美替代 `AppDaemon` 的 `HADashboard`。

![PREVIEW](https://github.com/Yonsm/ZhiDash/blob/main/PREVIEW.png)

## 1. 用法

- **使用方法**非常简单，只要把 [dash.html](https://github.com/Yonsm/ZhiDash/blob/main/dash.html) 、[css](https://github.com/Yonsm/ZhiDash/blob/main/css)、[fonts](https://github.com/Yonsm/ZhiDash/blob/main/fonts) 放入 [~/.homeassistant](https://github.com/Yonsm/.homeassistant)/`www` 目录，然后使用 `http://xxx.xxx.xxx:8123/local/dash.html` 访问即可。

    - 如果曾经登录过 Home Assistant 并保存过登录会话，访问 `/local/dash.html` 时会自动复用 HA localStorage accessToken 用于 WebSocket 认证。如果没有会提示转到 Home Assistant 主页登录，请选择保存本次登录才会记录 accessToken。
    - **最佳姿势**：在 configuration.yaml 中加入以下配置，可以在侧栏中直接访问；或在 [WallPanel](https://github.com/Yonsm/wallpanel-android) 中配合使用更佳：

```yaml
panel_iframe:
  dash:
    title: 面板
    icon: mdi:microsoft
    url: /local/dash.html
```
 
- **指定地址**：你也可以把 `dash.html` 放在任何位置，用浏览器打开后，在使用 `dash.html?password@ws:host:8123` 指定要访问的 WS API 地址，其中 password 可以是 HA Legacy Password 或者永久有效的 accessToken（在 HA 用户管理页面中创建“长期访问令牌”）。

- **分组排序**：`dash.html` 后面可以用`#`指定一个 group 名称（如 `dash.html#group.dash`，依此仅显示此分组的设备，且按这个分组排序（优先依据类型排序，同类型的按分组先后排序）。如果不指定，默认情况下使用 `group.default_view` 分组；如果不想使用分组，可以使用 `dash.html#NA` 来显示所有设备（如果你的 HA 中未使用分组功能，即 group.default_view 不存在，也会 fallback 到显示所有设备）。

- **移动设备**：自适应移动设备，同时在 iOS 中支持 WPA 模式。添加到桌面后使用，看起来非常像个 APP。

- **设备操作**：支持大多数设备的开关操作，支持空调和风扇的操作模式和温度设置。

## 2. 个性化配置

可以在 customize.yaml 中对特定的设备进行个性化定制，目前支持以下配置：

| key  | 用途 | 不配置/默认情况 | 备注 |
| ------------- | ------------- | ------------- | ------------- |
| dash_name | 名称 | 使用 attributes.friendly_name | 支持 template 模式 |
| dash_icon | 图标 | 传感器显示 state；空调显示当前温度；其它使用 attributes.icon | 支持 template 模式，支持文字（如引用一个传感器属性） |
| dash_extra | 扩展信息 | 空调和风扇显示操作模式和设定温度，其它无 | 支持 template 模式 |
| dash_extra_forced | 强制显示扩展信息 | off 状态下不显示扩展信息 |
| dash_hidden | 不显示 | | hidden 也不显示
| dash_click | 点击时的动作 | 传感器无动作，其它执行开关操作 | 支持 http 链接或 JavaScript |
| dash_relation | 驱动关联设备 | | 用于更新另外一个引用当前状态/属性的设备 |

关于 `template 模式`：支持以下几种示例：

- 直接输入文字如，如 `我的设备`
- 插入 state 宏，如 `状态 ${sate}`
- 插入 attributes 宏，如 `温度 ${temperature}℃`
- 插入其它设备的 state 宏，如 `气温 ${sensor.zhicai_temperature}℃`
- 插入其它设备的 attributes 宏，如 `气温 ${sensor.zhicai_weather.temperature}℃`
- 使用 JavaScript eval 运算，如`eval:"${status}"=="Charging" ? "充电中" : "${status}"`

更多个性化配置案例可以在我的 [customize.yaml](https://github.com/Yonsm/.homeassistant/blob/main/customize.yaml) 中搜索 `dash`，以上几种用法基本上都能找到案例。

## 3. 参考

- [WallPanel](https://github.com/Yonsm/wallpanel-android)
- [Yonsm.NET](https://yonsm.github.io/dash)
- [Hassbian.com](https://bbs.hassbian.com/thread-6005-1-1.html)
- [Yonsm's .homeassistant](https://github.com/Yonsm/.homeassistant)
