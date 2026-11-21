export interface CommentRules {
  requireChinese: boolean; blockedKeywords: string; blockedEmails: string;
  blockedIpHashes: string; blockLinks: boolean; maxLinkLength: number;
}
const lines = (value: string) => value.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
export function rejectsComment(comment: { authorName: string; authorEmail: string; body: string; ipHash: string | null }, rules: CommentRules): boolean {
  const text = `${comment.authorName}\n${comment.body}`;
  if (rules.requireChinese && (!/[\u3400-\u9fff]/u.test(comment.body) || /[ぁ-んァ-ヴ]/u.test(comment.body))) return true;
  if (lines(rules.blockedKeywords).some(word => text.toLowerCase().includes(word))) return true;
  if (lines(rules.blockedEmails).includes(comment.authorEmail.trim().toLowerCase())) return true;
  if (comment.ipHash && lines(rules.blockedIpHashes).includes(comment.ipHash.toLowerCase())) return true;
  if (rules.blockLinks && /https?:\/\/|www\./iu.test(text)) return true;
  if (rules.maxLinkLength > 0 && [...text.matchAll(/https?:\/\/[^\s<>]+/giu)].some(m => m[0].length > rules.maxLinkLength)) return true;
  return false;
}
