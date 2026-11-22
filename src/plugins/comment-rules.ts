export interface CommentRules {
  requireChinese: boolean; blockedKeywords: string; blockedEmails: string;
  maxLinkLength: number;
}
const lines = (value: string) => value.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
export function rejectsComment(comment: { authorName: string; authorEmail: string; body: string }, rules: CommentRules): boolean {
  const text = `${comment.authorName}\n${comment.body}`;
  if (rules.requireChinese && (!/[\u3400-\u9fff]/u.test(comment.body) || /[ぁ-んァ-ヴ]/u.test(comment.body))) return true;
  if (lines(rules.blockedKeywords).some(word => text.toLowerCase().includes(word))) return true;
  if (lines(rules.blockedEmails).includes(comment.authorEmail.trim().toLowerCase())) return true;
  if (rules.maxLinkLength > 0 && [...text.matchAll(/https?:\/\/[^\s<>]+/giu)].some(m => m[0].length > rules.maxLinkLength)) return true;
  return false;
}
