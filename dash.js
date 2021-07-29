_ws = null // WebSocket handle
_wsid = 0 // WebSocket session id
_wsapi = null // WebSocket api url
_token = null // Access token or password
_call_entity_id = null // Processing entity_id
_entities = null // All entities

function load() {
	// Adjust grid width
	var clientWidth = document.documentElement.clientWidth
	var count = Math.floor(clientWidth / 124)
	var width = (clientWidth - count * 4) / count
	width = Math.floor(width * 10) / 10
	document.styleSheets[1].cssRules[0].style.width = width + 'px'
	document.styleSheets[1].cssRules[1].style.width = Math.ceil(width * 1.5 + 1) + 'px'

	// Parse params
	var args = urlArgs()
	_wsapi = (args.api || ((location.protocol == 'https:' ? 'wss://' : 'ws://') + location.host)) + '/api/websocket'
	_token = args.token
	if (!_token) {
		try {
			_token = JSON.parse(localStorage.hassTokens).access_token
		} catch (e) {
			return handleAuth(args.code)
		}
	}

	connect()
}

function urlArgs() {
	var args = {}
	var query = location.search.substring(1)
	var pairs = query.split('&')
	for (var i = 0; i < pairs.length; i++) {
		var pos = pairs[i].indexOf('=')
		if (pos == -1)
			continue
		var name = pairs[i].substring(0, pos)
		var value = pairs[i].substring(pos + 1)
		args[name] = value
	}
	return args
}

function connect() {
	if (_ws) {
		_ws.close()
		delete _ws
	}
	_wsid = 2
	_call_entity_id = null
	_entities = null

	floater('loading')

	_ws = new WebSocket(_wsapi)
	_ws.onopen = onOpen
	_ws.onclose = onClose
	_ws.onmessage = onMessage
}

function onOpen() {
	if (_token)
		_ws.send('{"type": "auth", "' + (_token.length < 20 ? 'api_password' : 'access_token') + '": "' + _token + '"}')
	_ws.send('{"id": 1, "type": "get_states"}')
	_ws.send('{"id": 2, "type": "subscribe_events", "event_type": "state_changed"}')
}

var _retryCount = 0
function onClose() {
	if (_retryCount < 0) // Skip auth invalid
		return
	var timeout = Math.min(Math.pow(4, ++_retryCount), 3600)
	setTimeout(connect, timeout * 1000)
	if (_retryCount > 1 && !document.getElementById('error')) { // Skip first or existing error
		var delay = (timeout > 60) ? (Math.ceil(timeout / 60) + ' 分钟') : (timeout + ' 秒')
		floater('error', '连接关闭，' + delay + '后<a href="javascript:connect()">重新连接</a>')
	}
}

function onMessage(message) {
	var data = JSON.parse(message.data)
	switch (data.type) {
		case 'result':
			onResult(message, data)
			break
		case 'event':
			onEvent(message, data)
			break
		case 'auth_invalid':
			onAuthInvalid()
			break
		case 'auth_required':
		case 'auth_ok':
			break
		default:
			console.log('未知消息：' + data)
			break
	}
}

function onResult(message, data) {
	if (!data.success) {
		floater('error', '未知结果 ' + (data.error ? data.error.message : message.data) + '，请<a href="javascript:connect()">重新连接</a>')
	}
	else if (data.id == 1) {
		// Responed to get_states
		_retryCount = 0
		_entities = data.result
		reloadContent()
	}
	else if (data.id == 2) {
		// Responed to subscribe_events
	} else if (data.id == _wsid && _call_entity_id) {
		// Avoid mis-operation and ensure animation
		setTimeout(function () {
			// Responed to call_service
			document.getElementById(_call_entity_id).style = ''
			_call_entity_id = null
		}, 1000)
	}
}

function onEvent(message, data) {
	var entity = data.event.data.new_state
	if (entity) {
		var entity_id = entity.entity_id
		for (var i in _entities) {
			if (_entities[i].entity_id == entity_id) {
				_entities[i] = entity
				break
			}
		}
		updateGrid(entity)
	} else {
		console.log('事件错误：' + message.data)
		//floater('error', '事件错误 ' + (data.error ? data.error.message : message.data) + '，请<a href="javascript:connect()">重新连接</a>')
	}
}

function onAuthInvalid() {
	if (_retryCount < 0)
		return showAuthError('无效认证') // Impossible?
	else
		_retryCount = -1

	_token = null
	try {
		var tokens = JSON.parse(localStorage.hassTokens)
		getAuthToken('refresh_token', 'refresh_token=' + tokens.refresh_token, tokens)
	} catch (e) {
		return showAuthError('无登录令牌')
	}
}

function handleAuth(code) {
	if (code) {
		// Auth callback
		floater('loading')
		console.log('认证回调：' + code)
		getAuthToken('authorization_code', 'code=' + code)
	} else {
		// Auth request
		var client_id = location.protocol + '//' + location.host + '/'
		var url = '/auth/authorize?client_id=' + encodeURIComponent(client_id) + '&redirect_uri=' + encodeURIComponent(location.href)
		floater('error', '无登录令牌。2 秒后转到<a href="' + url + '">登录页面</a>')
		setTimeout(function () { location = url }, 2000)
	}
}

function getAuthToken(grant_type, param, tokens) {
	var hassUrl = location.protocol + '//' + location.host
	var body = 'grant_type=' + grant_type + '&' + param + '&client_id=' + encodeURIComponent(hassUrl + '/')
	var xhr = new XMLHttpRequest()
	xhr.onreadystatechange = function () {
		if (xhr.readyState == 4) {
			if (xhr.status == 200) {
				resp = xhr.response
				if (tokens) {
					tokens.expires_in = resp.expires_in
					tokens.access_token = resp.access_token
				} else {
					tokens = resp
					tokens.hassUrl = hassUrl
					tokens.clientId = hassUrl + '/'
				}
				_token = tokens.access_token
				localStorage.hassTokens = JSON.stringify(tokens)
				setTimeout(connect, 200)
				console.log('获取令牌成功：' + _token)
			} else {
				showAuthError('获取令牌失败')
			}
		}
	}
	xhr.responseType = 'json'
	xhr.open('POST', '/auth/token')
	xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded")
	xhr.send(body)
	console.log('尝试获取令牌：' + body)
}

function showAuthError(text) {
	var error = text + '！请<a href="javascript:location=\'' + location.protocol + '//' + location.host + '\'">登录首页</a>并保存后<a href="javascript:location.reload()">刷新</a>'
	error += '<div style="font-size:8px; color:#999999; line-height: 16px">也可以指定长期访问令牌和地址，如：' + location.href.split('?')[0] + '?token=xxxx&api=ws:host:8123</div>'
	floater('error', error)
}

var _group_entity_ids = null
function reloadContent() {
	// Fetch entities id in group
	var group_id = location.hash.slice(1)
	if (group_id) {
		if (!group_id.startsWith('group.'))
			group_id = 'group.' + group_id
		_group_entity_ids = []
		fetchEntities(group_id)
		if (_group_entity_ids.length == 0)
			_group_entity_ids = null
	} else {
		_group_entity_ids = null
	}

	// Purify and sort
	//console.time('Purify')
	// var entities = _entities
	// for (var j = entities.length - 1; j >= 0; j--) {
	// 	if (!isValidEntity(entities[j])) {
	// 		entities.splice(j, 1)
	// 	}
	// }
	// entities.sort(compareEntity)

	// Purify and sort to another array (without purifying _entities)
	var entities = []
	var entities_count = 0
	for (var k in _entities) {
		var entity = _entities[k]
		if (isValidEntity(entity)) {
			var low = 0
			var high = entities_count++
			while (low < high) {
				var mid = (low + high) >>> 1
				if (compareEntity(entities[mid], entity) < 0) low = mid + 1
				else high = mid
			}
			entities.splice(low, 0, entity)
		} else if (entity.entity_id == 'zone.home') {
			document.title = entity.attributes.friendly_name
		}
	}
	//console.timeEnd('Purify')

	// Generate entities
	var html = ''
	for (var i in entities)
		html += makeGrid(entities[i])

	if (location.hash)
		html += makeUtility("location.hash = ''; reloadContent()", 'keyboard-backspace', '全部')
	html += makeUtility("location.reload(true)", 'reload', '刷新')
	if (self == top) {
		html += makeUtility("location = '/'", 'home-assistant', '概览')
		html += makeUtility("location = '/config/server_control'", 'server', '服务')
		html += makeUtility("location = '/config/integrations'", 'puzzle', '集成')
		html += makeUtility("location = '/config/logs'", 'math-log', '日志')
		html += makeUtility("location = '/config/automation/dashboard'", 'robot', '自动化')
		html += makeUtility("location = '/config/customize'", 'pencil', '自定义')
		html += makeUtility("location = '/developer-tools'", 'hammer', '开发者')
	}

	floater()
	document.getElementById('content').innerHTML = html
}

_refresh_timer = null
function updateGrid(entity) {
	var entity_id = entity.entity_id
	var grid = document.getElementById(entity_id)
	if (grid) {
		grid.innerHTML = makeEntity(entity)
		if (entity.attributes.dash_relation) {
			var relation = findEntity(entity.attributes.dash_relation)
			if (relation)
				updateGrid(relation)
		}
	} else if (isValidEntity(entity)) {
		if (_refresh_timer)
			clearTimeout(_refresh_timer)
		_refresh_timer = setTimeout(function () {
			_refresh_timer = null
			connect()
		}, 1000 * 60)
		floater('error', '发现“' + entity.attributes.friendly_name + '”，1 分钟后<a href="javascript:connect()">重新连接</a>')
	} else {
		console.log('忽略事件：' + entity_id)
	}
}

function onClick(grid) {
	var off = grid.children[1].className.startsWith('state off')
	if (grid.className == 'entity cover') {
		var service = off ? 'close_cover' : 'open_cover'
	} else if (grid.className == 'entity vacuum') {
		var service = off ? 'start' : 'return_to_base'
	} else if (grid.className == 'entity group') {
		location.hash = '#' + grid.id
		reloadContent();
		return
	} else {
		var service = off ? 'turn_on' : 'turn_off'
	}
	// Kavana: Respond right away
	// var entity = findEntity(grid.id)
	// if (entity) {
	// 	entity.state = off ? 'on' : 'off'
	// 	grid.innerHTML = makeEntity(entity)
	// }
	doService(service, { entity_id: grid.id }, grid)
}

function onTune(event) {
	event.stopPropagation()

	var tuner = event.target
	var extra = tuner.parentElement
	var grid = extra.parentElement
	var moder = extra.children[1]
	var text = moder.options[moder.selectedIndex].innerText
	var temperature = parseInt(text.split(' ')[1]) + (tuner.innerText == '△' ? 1 : -1)
	doService('set_temperature', { entity_id: grid.id, temperature: temperature }, tuner)
}

function onMode(moder) {
	var extra = moder.parentElement
	var grid = extra.parentElement
	var mode = moder.options[moder.selectedIndex].value
	if (grid.className == 'entity climate')
		doService('set_hvac_mode', { entity_id: grid.id, hvac_mode: mode }, moder)
	else
		doService('set_preset_mode', { entity_id: grid.id, preset_mode: mode }, moder)
}

function doService(service, data, element) {
	var entity_id = data.entity_id
	if (_call_entity_id) {
		console.log('忽略调用：' + service + '/' + entity_id)
		return
	}
	_call_entity_id = entity_id
	element.style = 'animation: tuning 1s infinite alternate'
	//console.log('调用服务：' + service + '/' + entity_id)
	callService(entity_id.split('.')[0], service, data)
}

function callService(domain, service, data) {
	var body = JSON.stringify({
		id: ++_wsid,
		type: 'call_service',
		domain: domain,
		service: service,
		service_data: data,
	})
	_ws.send(body)
	console.log('调用服务：' + body)
}

function mqttPublish(topic, payload) {
	callService('mqtt', 'publish', { 'topic': topic, 'payload': payload })
}

_DOMAIN_ICONS = {
	weather: 'weather-partly-cloudy',
	sensor: 'flower',
	binary_sensor: 'bullseye',
	person: 'account',
	//device_tracker: 'cellphone',

	light: 'lightbulb',

	switch: 'light-switch',
	media_player: 'play-circle-outline',
	cover: 'window-closed',
	vacuum: 'robot-vacuum',

	fan: 'fan',
	climate: 'thermostat',

	group: 'home-heart',
	camera: 'camera',
}

_CLICKABLE_DOMAINS = ['light', 'switch', 'media_player', 'cover', 'vacuum', 'fan', 'climate', 'group']

_TRANS = {
	None: '无',
	unknown: '未知',
	unavailable: '不可用',

	off: '关闭',
	on: '开启',

	idle: '空闲',
	auto: '自动',
	low: '低速',
	medium: '中速',
	middle: '中速',
	high: '高速',
	favorite: '最爱',

	strong: '高速',
	silent: '静音',
	interval: '间歇',

	cool: '制冷',
	heat: '制热',
	dry: '除湿',
	fan: '送风',
	fan_only: '送风',

	Error: '错误',
	Paused: '暂停',
	Cleaning: '清扫中',
	Charging: '充电中',
	'Charger disconnected': '充电断开',
}

_BINARY_SENSOR_ICONS = {
	battery: ['battery', 'battery-outline'],
	cold: ['thermometer', 'snowflake'],
	connectivity: ['server-network-off', 'server-network'],
	door: ['door-closed', 'door-open'],
	garage_door: ['garage', 'garage-open'],
	gas: ['shield-check', 'alert'],
	power: ['shield-check', 'alert'],
	problem: ['shield-check', 'alert'],
	safety: ['shield-check', 'alert'],
	smoke: ['shield-check', 'alert'],
	heat: ['thermometer', 'fire'],
	light: ['brightness-5', 'brightness-7'],
	lock: ['lock', 'lock-open'],
	moisture: ['water-off', 'water'],
	motion: ['walk', 'run'],
	occupancy: ['home-outline', 'home'],
	opening: ['square', 'square-outline'],
	plug: ['power-plug-off', 'power-plug'],
	presence: ['home-outline', 'home'],
	sound: ['music-note-off', 'music-note'],
	vibration: ['crop-portrait', 'vibrate'],
	window: ['window-closed', 'window-open'],
	default: ['radiobox-blank', 'checkbox-marked-circle'],
}

_WEATHER_ICONS = {
	'clear-night': 'night',
	// 'cloudy': 'cloudy',
	// 'fog': 'fog',
	// 'hail': 'hail',
	// 'lightning': 'lightning',
	// 'lightning-rainy': 'lightning-rainy',
	'partlycloudy': 'partly-cloudy',
	// 'pouring': 'pouring',
	// 'rainy': 'rainy',
	// 'snowy': 'snowy',
	// 'snowy-rainy': 'snowy-rainy',
	// 'sunny': 'sunny',
	// 'windy': 'windy',
	// 'windy-variant': 'windy-variant',
	'exceptional': 'partly-cloudy',
}

function makeGrid(entity) {
	var entity_id = entity.entity_id
	var domain = entity_id.split('.')[0]

	var html = '<div class="entity ' + domain + '" id="' + entity_id + '"'
	if (entity.attributes.hasOwnProperty('dash_click'))
		html += " onclick='" + makeClick(entity.attributes.dash_click) + "'"
	else if (_CLICKABLE_DOMAINS.indexOf(domain) != -1)
		html += ' onclick="onClick(this)"'
	if (domain == 'camera')
		html += ' style="background-image:url(' + entity.attributes.entity_picture + ')"'
	html += '>'
	html += makeEntity(entity)
	html += '</div> '

	return html
}

function makeEntity(entity) {
	var entity_id = entity.entity_id
	var domain = entity_id.split('.')[0]
	var state = entity.state
	var attributes = entity.attributes

	var name = attributes.hasOwnProperty('dash_name') ? renderTemplate(attributes.dash_name, state, attributes, true) : attributes.friendly_name
	var html = '<div class="name">' + name + '</div>'

	var na = state == '' || state == 'unavailable' || state == 'unknown' || state == 'None'
	var off = na || state == 'off' || state == 'not_home' || state == 'open' || state == 'opening' || state == 'docked' || state == 'idle' ? ' off' : ''

	var has_dash_icon = attributes.hasOwnProperty('dash_icon')
	if ((!has_dash_icon && (domain == 'sensor' || domain == 'climate')) || na) {
		var value = !na && domain == 'climate' ? attributes.current_temperature : _TRANS[state] || state || '无'
		var nan = isNaN(value)
		var type = domain == 'climate' ? 'temperature' : attributes.device_class
		var overflow = nan ? '' : sensorOverflow(type, value)
		html += '<div class="state' + off + overflow + (nan ? ' nan' : '') + '">'
		if (nan) {
			html += value
		} else {
			value = String(value)
			var dot = value.indexOf('.')
			html += dot < 0 ? value : value.substring(0, dot < 4 ? 5 : dot == 4 ? 4 : dot)
		}

		if (!off) {
			var unit = attributes.hasOwnProperty('dash_unit') ? renderTemplate(attributes.dash_unit, state, attributes) : attributes.unit_of_measurement
			if (unit)
				html += '<span class="unit">' + unit + '</span>'
		}
	} else if (domain != 'camera') {
		html += '<div class="state' + off + '">'

		if (has_dash_icon) {
			var icon = renderTemplate(attributes.dash_icon, state, attributes)
			if (icon == '' || icon == 'unavailable' || icon == 'unknown' || icon == 'None')
				icon = attributes.icon
		} else {
			var icon = attributes.icon
		}
		if (icon) {
			if (icon.startsWith('mdi:')) {
				icon = icon.slice(4)
			} else {
				html += icon
				icon = null
			}
		} else if (domain == 'binary_sensor') {
			var device_class = attributes.device_class
			if (!_BINARY_SENSOR_ICONS.hasOwnProperty(device_class))
				device_class = 'default'
			icon = _BINARY_SENSOR_ICONS[device_class][off ? 0 : 1]
		} else if (domain == 'weather') {
			icon = 'weather-' + (_WEATHER_ICONS[state] || state)
		} else {
			icon = _DOMAIN_ICONS[domain]
		}

		if (icon)
			html += '<i class="mdi mdi-' + icon + '"></i>'
	}
	html += '</div>'

	var dash_extra_forced = attributes.dash_extra_forced
	if (!dash_extra_forced) {
		if (domain == 'vacuum')
			dash_extra_forced = attributes.status
		else if (domain == 'weather')
			dash_extra_forced = attributes.attribution
	}
	if (!off || dash_extra_forced) {
		var extra = null
		var dash_extra = typeof (dash_extra_forced) == 'string' ? dash_extra_forced : attributes.dash_extra
		if (dash_extra) {
			extra = renderTemplate(dash_extra, state, attributes, true)
			if (extra.length > 8)
				extra = '<marquee scrollamount="3">' + extra + '</marquee>'
			if (attributes.hasOwnProperty('dash_extra_click'))
				extra = '<span class="tuner" onclick=\'event.stopPropagation(); ' + makeClick(attributes.dash_extra_click) + "'>" + extra + '</span>'
		} else if (domain == 'climate' && attributes.hvac_modes) {
			extra = '<span class="tuner" onclick="onTune(event)">▽</span>' + makeSelect(attributes.hvac_modes, state, attributes.temperature) + '<span class="tuner" onclick="onTune(event)">△</span>'
		} else if (domain == 'fan' && attributes.preset_modes && attributes.preset_modes.length > 0) {
			extra = makeSelect(attributes.preset_modes, attributes.preset_mode)
		}
		if (extra) {
			html += '<div class="extra' + off + '">' + extra + '</div>'
		}
	}

	return html
}

function makeSelect(mode_list, selected, temperature) {
	html = '<select class="moder" onclick="event.stopPropagation()" onchange="onMode(this)">'
	for (var i in mode_list) {
		var mode = mode_list[i]
		var key = mode.toLowerCase()
		var text = _TRANS[key] || mode.replace(/level/gi, '档位')
		html += '<option value="' + mode + '"' + (mode == selected ? ' selected' : '') + '>' + text
		if (mode == selected && temperature) {
			html += ' ' + temperature
		}
		html += '</option>'
	}
	html += '</select>'
	return html
}

function makeUtility(action, icon, title) {
	return '<div class="entity" onclick="' + action + '"><div class="noname"></div><div class="state"><i class="mdi mdi-' + icon + '"></i></div><div class="extra">' + title + '</div></div>'
}

_SENSOR_RANGES = {
	'temperature': [30, 38],
	'humidity': [72, 82],
	'pm25': [40, 70],
	'co2': [900, 1600],
	'hcho': [0.08, 0.2],
}

function sensorOverflow(type, value) {
	var warning = ''
	var range = _SENSOR_RANGES[type]
	if (range) {
		if (value >= range[1])
			return ' critical'
		else if (value >= range[0])
			return ' caution'
	}
	return ''
}

function makeClick(click) {
	if (click.startsWith('/')) {
		if (self != top)
			return 'window.open("' + click + '")'
	}
	else if (!click.substring(0, 10).includes('://')) {
		return click
	}
	return 'location="' + click + '"'
}

function renderTemplate(template, state, attributes, trans) {
	if (attributes.hasOwnProperty(template))
		return attributes[template]

	var result = ''
	for (var end = 0; true; end++) {
		var start = template.indexOf('${', end)
		if (start != -1) {
			result += template.slice(end, start)
			end = template.indexOf('}', start)
			if (end != -1) {
				var macro = template.slice(start + 2, end)
				var parts = macro.split('.')
				var count = parts.length
				if (count == 1) {
					result += macro == 'state' ? state : attributes.hasOwnProperty(macro) ? attributes[macro] : '无属性'
				} else {
					var entity = findEntity(parts[0] + '.' + parts[1])
					result += entity ? (count == 2 ? entity.state : attributes.hasOwnProperty(parts[2]) ? attributes[parts[2]] : '无属性') : '无设备'
				}
				continue
			}
		} else {
			result += template.slice(end)
		}
		if (result.startsWith('eval:')) {
			try {
				return eval(result.slice(5))
			} catch (e) {
				console.log('执行错误：' + result)
				return '错误'
			}
		}
		return trans ? _TRANS[result] || result : result
	}
}

var _sorted_domains = Object.keys(_DOMAIN_ICONS)
var _sorted_classes = ['opening', 'motion', 'window', 'illuminance']
var _sorted_units = ['μg/m³', 'ppm', '°C', '%', 'mg/m³', 'lm']
var _sorted_names = '爸妈爷外阿入玄客餐厨过洗走主浴衣次儿书阳'
function sortedCompare(sorted_items, item1, item2) {
	index1 = sorted_items.indexOf(item1) >>> 0
	index2 = sorted_items.indexOf(item2) >>> 0
	return index1 - index2
}

function compareEntity(entity1, entity2) {
	// Sort by domain
	var entity_id1 = entity1.entity_id
	var entity_id2 = entity2.entity_id
	var domain1 = entity_id1.split('.')[0]
	var domain2 = entity_id2.split('.')[0]
	var ret = sortedCompare(_sorted_domains, domain1, domain2)
	if (ret) return ret

	var attributes1 = entity1.attributes
	var attributes2 = entity2.attributes

	// Sort by dash_order
	var order1 = attributes1.dash_order
	var order2 = attributes2.dash_order
	if (order1)
		return order2 ? parseInt(order1) - parseInt(order2) : -1
	else if (order2)
		return 1

	if (domain1 == 'sensor') {
		// Sort by unit_of_measurement
		var unit1 = attributes1.unit_of_measurement
		var unit2 = attributes2.unit_of_measurement
		ret = sortedCompare(_sorted_units, unit1, unit2)
		if (ret) return ret

		ret = unit1 ? unit1.localeCompare(unit2) : unit2 ? unit2.localeCompare(unit1) : 0
		if (ret) return ret
	} else if (domain1 == 'binary_sensor') {
		// Sort by device_class
		ret = sortedCompare(_sorted_classes, attributes1.device_class, attributes2.device_class)
		if (ret) return ret
	}

	if (_group_entity_ids) {
		// Sort by group
		ret = sortedCompare(_group_entity_ids, entity_id1, entity_id2)
		if (ret) return ret
	}

	// Sort by icon
	if (attributes1.icon) {
		ret = attributes1.icon.localeCompare(attributes2.icon)
		if (ret) return ret
	} else if (attributes2.icon) {
		return -1
	}

	// Sort by prefix
	name1 = attributes1.friendly_name
	name2 = attributes2.friendly_name
	ret = sortedCompare(_sorted_names, name1[0], name2[0])
	if (ret) return ret

	// Sort by name
	return name1.localeCompare(name2)
}

function findEntity(entity_id) {
	for (var i in _entities) {
		var entity = _entities[i]
		if (entity.entity_id == entity_id)
			return entity
	}
	console.log('无法找到实体：' + entity_id)
	return null
}

function fetchEntities(group_id) {
	var group = findEntity(group_id)
	if (group) {
		var ids = group.attributes.entity_id
		for (var i in ids) {
			var entity_id = ids[i]
			if (entity_id.startsWith('group'))
				fetchEntities(entity_id)
			_group_entity_ids.push(entity_id)
		}
	}
}

function isValidEntity(entity) {
	var entity_id = entity.entity_id
	return (
		_DOMAIN_ICONS.hasOwnProperty(entity_id.split('.')[0]) &&
		!entity.attributes.hidden &&
		!entity.attributes.dash_hidden &&
		!entity_id.startsWith('binary_sensor.cube') &&
		!entity_id.startsWith('binary_sensor.switch') &&
		(!_group_entity_ids || _group_entity_ids.indexOf(entity_id) != -1)
	)
}

function floater(type, text) {
	document.getElementById('floater').innerHTML = type ? '<div id="' + type + '">' + (text || '') + '</div>' : ''
}
