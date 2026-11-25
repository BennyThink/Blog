const replyComponent = `
function DmesgCommentReply({ comment }) {
	const queryClient = useQueryClient();
	const toast = useKumoToastManager();
	const { i18n: locale } = useLingui();
	const zh = locale.locale.startsWith("zh");
	const [open, setOpen] = React$1.useState(false);
	const [body, setBody] = React$1.useState("");
	const [error, setError] = React$1.useState("");
	const sending = React$1.useRef(false);
	const [busy, setBusy] = React$1.useState(false);
	if (!comment.canReply || !["approved", "pending"].includes(comment.status)) return null;

	const reply = zh ? "回复" : "Reply";
	const submitLabel = comment.status === "pending"
		? (zh ? "批准并回复" : "Approve and reply")
		: (zh ? "发送回复" : "Send reply");
	const submit = async event => {
		event.preventDefault();
		if (sending.current || !body.trim()) return;
		sending.current = true;
		setBusy(true);
		setError("");
		const failure = zh ? "提交回复失败。" : "Could not submit the reply.";
		try {
			const result = await parseApiResponse(await apiFetch(
				"/_emdash/api/admin/comments/" + encodeURIComponent(comment.id) + "/reply",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ body, approve: comment.status === "pending" })
				}
			), failure);
			const published = result.status === "approved";
			toast.add({ title: published
				? (zh ? "回复已发布" : "Reply published")
				: (zh ? "回复已保存，当前未公开" : "Reply saved and awaiting moderation")
			});
			setOpen(false);
			setBody("");
			void queryClient.invalidateQueries({ queryKey: ["comments"] });
			void queryClient.invalidateQueries({ queryKey: ["commentCounts"] });
		} catch (error) {
			setError(error instanceof Error ? error.message : failure);
		} finally {
			sending.current = false;
			setBusy(false);
		}
	};
	if (!open) return jsx(Button, {
		variant: "ghost", size: "sm", type: "button", className: "mt-1",
		onClick: () => setOpen(true),
		children: comment.status === "pending" ? submitLabel : reply
	});
	return jsxs("form", {
		className: "mt-2 flex flex-col gap-2",
		onSubmit: submit,
		children: [
			jsx("textarea", {
				className: "w-full rounded-md border border-kumo-line bg-kumo-base p-2 text-sm",
				"aria-label": reply,
				autoFocus: true, required: true, rows: 3, maxLength: 5000,
				value: body, disabled: busy,
				onChange: event => setBody(event.target.value)
			}),
			error && jsx("p", { role: "alert", className: "text-sm text-kumo-danger", children: error }),
			jsxs("div", {
				className: "flex flex-wrap gap-2",
				children: [
					jsx(Button, {
						variant: "primary", size: "sm", type: "submit",
						disabled: busy || !body.trim(), children: submitLabel
					}),
					jsx(Button, {
						variant: "ghost", size: "sm", disabled: busy, type: "button",
						onClick: () => { setOpen(false); setError(""); },
						children: zh ? "取消" : "Cancel"
					})
				]
			})
		]
	});
}
`;

export const adminComments = {
	name: "dmesg-admin-comments",
	enforce: "pre",
	transform(code, id) {
		if (!/\/@emdash-cms\/admin\/dist\/App-[\w-]+\.js$/.test(id)) return;
		const tabOrder = /(\btabs: \[\s*)(\{\s*value: "pending",[\s\S]*?\n\s*\})(,\s*)(\{\s*value: "approved",[\s\S]*?\n\s*\})(?=,\s*\{\s*value: "spam",)/g;
		if ([...code.matchAll(tabOrder)].length !== 1) this.error("The EmDash comment tabs changed.");
		code = code.replace(tabOrder, "$1$4$3$2");
		const edits = [
			[
				'const [activeStatus, setActiveStatus] = React$1.useState("pending");',
				'const [activeStatus, setActiveStatus] = React$1.useState("approved");',
			],
			[
				'function CommentRow({ comment,',
				replyComponent + 'function CommentRow({ comment,',
			],
			[
				'const collection = /* @__PURE__ */ jsx("span", {\n\t\tclassName: cellCodeClassName,\n\t\tchildren: comment.collection\n\t});',
				`const collection = comment.contentHref
					? jsx("a", {
						href: comment.contentHref, target: "_blank", rel: "noopener noreferrer",
						className: "text-kumo-link underline wrap-anywhere", dir: "auto",
						children: comment.contentTitle || comment.collection
					})
					: jsx("span", { className: "wrap-anywhere", children: comment.contentTitle || comment.collection });`,
			],
			[
				'children: [collection, formattedDate]\n\t\t\t\t})',
				'children: [collection, formattedDate]\n\t\t\t\t}), jsx(DmesgCommentReply, { comment })',
			],
		];
		for (const [before, after] of edits) {
			if (code.split(before).length !== 2) this.error("The EmDash comment list changed. Review the comment inbox customization.");
			code = code.replace(before, () => after);
		}
		return { code, map: null };
	},
};
