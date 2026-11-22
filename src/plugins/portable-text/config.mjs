const textField = { type: "text_input", action_id: "content", label: "内容", multiline: true };

export const portableTextBlocks = [
	...[ ["v_notice", "绿色通知"], ["v_error", "红色警告"], ["v_warn", "黄色提醒"], ["v_tips", "灰色提示"], ["v_blue", "蓝色提示"], ["v_act", "蓝边文本框"] ].map(([type, label]) => ({ type, label, category: "WordPress 提示框", icon: "info", fields: [textField] })),
	...[ ["alert_success", "Alert 绿色成功提示"], ["alert_info", "Alert 蓝色信息提示"], ["alert_warning", "Alert 黄色警告提示"], ["alert_error", "Alert 红色错误提示"] ].map(([type, label]) => ({ type, label, category: "WordPress Alert", icon: "info", fields: [textField] })),
	...[ ["gb", "绿色按钮"], ["bb", "蓝色按钮"], ["yb", "黄色按钮"], ["lhb", "透明按钮"] ].map(([type, label]) => ({ type: `${type}_button`, label, category: "WordPress 按钮", icon: "link", fields: [
		{ type: "text_input", action_id: "label", label: "按钮文字" }, { type: "text_input", action_id: "href", label: "链接地址" },
	] })),
	...[ ["wp_mark", "黄色高亮文字"], ["wp_center", "居中文本"], ["wp_indent", "首行缩进段落"] ].map(([type, label]) => ({ type, label, category: "WordPress 格式", icon: "info", fields: [textField] })),
];
