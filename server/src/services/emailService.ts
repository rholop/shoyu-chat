import { Resend } from 'resend';
import { PatternReport, ProjectSuggestion, OpenLoop } from '../types';
import { logger } from '../utils/logger';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface DigestEmailParams {
  weekLabel: string;
  weekSummary: string;
  monthSummary: string;
  projectSummaries: string;
  digestNarrative: string;
  personalInsights: string;
  patternReport: PatternReport;
  unresolvedThreads: OpenLoop[];
  projectSuggestions: ProjectSuggestion[];
  date: string;
}

export function buildDigestEmailHtml(params: DigestEmailParams): string {
  const {
    weekLabel,
    weekSummary,
    monthSummary,
    projectSummaries,
    digestNarrative,
    personalInsights,
    patternReport,
    unresolvedThreads,
    projectSuggestions,
    date,
  } = params;

  // Week at a Glance stats
  const thisWeekConversations = patternReport.last4Weeks.weeklyConversationCounts.slice(-1)[0]?.count ?? 0;
  const glanceSection = `<div class="section">
    <h2>Week at a Glance</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5;">
      <tr><td style="padding: 6px 0; font-weight: 500; width: 40%;">Conversations this week:</td><td style="padding: 6px 0;">${thisWeekConversations}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: 500;">Total messages (all time):</td><td style="padding: 6px 0;">${patternReport.allTime.totalMessages}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: 500;">Most active project:</td><td style="padding: 6px 0;">${escapeHtml(patternReport.allTime.mostActiveProject ?? 'None')}</td></tr>
    </table>
  </div>`;

  // Recurring Interests
  const suggestionSection =
    projectSuggestions?.length > 0
      ? `<div class="section">
    <h2>Recurring Interests (not yet a project)</h2>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.6;">
      ${projectSuggestions
        .map(
          (s) => `
        <li style="margin-bottom: 8px;">
          • <strong>${escapeHtml(s.topic)}</strong> — ${s.conversationCount} conversations, ${
            s.weekCount
          } weeks. Recent: "${escapeHtml(s.relatedGoals[0] || '')}"
        </li>`,
        )
        .join('')}
    </ul>
  </div>`
      : '';

  // Loose Threads
  const unresolvedSection =
    unresolvedThreads.length > 0
      ? `<div class="section">
    <h2>Loose Threads (${unresolvedThreads.length} unresolved)</h2>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.6;">
      ${unresolvedThreads
        .map(
          (t) => `
        <li style="margin-bottom: 8px;">
          • <strong>${escapeHtml(t.title)}</strong> — ${t.daysSinceCreated} days ago${
            t.projectName ? ` (${escapeHtml(t.projectName)})` : ''
          }
        </li>`,
        )
        .join('')}
    </ul>
  </div>`
      : '';

  // Active Projects
  const projectsSection = projectSummaries
    ? `<div class="section">
    <h2>Active Projects</h2>
    <pre>${escapeHtml(projectSummaries)}</pre>
  </div>`
    : '';

  // About You This Week
  const aboutYouSection = `<div class="section">
    <h2>About You This Week</h2>
    <pre>${escapeHtml(personalInsights)}</pre>
  </div>`;

  // Your Numbers table rows
  const topTopicsRow = `<tr><td style="padding: 8px 0; font-weight: 500;">Top topics:</td><td style="padding: 8px 0;">${
    patternReport.last4Weeks.topTopics.map((t) => `${escapeHtml(t.topic)} (${t.count})`).join(', ') || 'None'
  }</td></tr>`;

  const intentRow = `<tr><td style="padding: 8px 0; font-weight: 500;">Intent split:</td><td style="padding: 8px 0;">${
    patternReport.last4Weeks.topIntents.map((i) => `${escapeHtml(i.intent)} ${i.percentage}%`).join(' · ') || 'None'
  }</td></tr>`;

  const newTopicsRow = `<tr><td style="padding: 8px 0; font-weight: 500;">New this week:</td><td style="padding: 8px 0;">${
    patternReport.last4Weeks.newTopics.map(escapeHtml).join(', ') || 'None'
  }</td></tr>`;

  const returningTopicsRow = `<tr><td style="padding: 8px 0; font-weight: 500;">Returning:</td><td style="padding: 8px 0;">${
    patternReport.last4Weeks.returningTopics.map(escapeHtml).join(', ') || 'None'
  }</td></tr>`;

  const conversationsRow = `<tr><td style="padding: 8px 0; font-weight: 500;">Conversations:</td><td style="padding: 8px 0;">${
    patternReport.last4Weeks.weeklyConversationCounts.map((w) => `${escapeHtml(w.week)}: ${w.count}`).join(' · ') || 'None'
  }</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
  .container { max-width: 640px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: #0f172a; color: #fff; padding: 32px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; }
  .header p { margin: 0; color: #94a3b8; font-size: 14px; }
  .section { padding: 24px 32px; border-bottom: 1px solid #f1f5f9; }
  .section h2 { margin: 0 0 12px; font-size: 16px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; }
  .section pre { white-space: pre-wrap; font-family: inherit; margin: 0; line-height: 1.6; }
  .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Weekly AI Digest</h1>
    <p>${escapeHtml(weekLabel)}</p>
  </div>
  ${glanceSection}
  ${suggestionSection}
  ${unresolvedSection}
  <div class="section">
    <h2>This Week's Summary</h2>
    <pre>${escapeHtml(digestNarrative) || 'No summary available.'}</pre>
  </div>
  ${projectsSection}
  ${aboutYouSection}
  <div class="section">
    <h2>Monthly Themes</h2>
    <pre>${escapeHtml(monthSummary) || 'No monthly summary yet.'}</pre>
  </div>
  <div class="section">
    <h2>Your Numbers (last 4 weeks)</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5;">
      ${topTopicsRow}
      ${intentRow}
      ${newTopicsRow}
      ${returningTopicsRow}
      ${conversationsRow}
    </table>
  </div>
  <div class="footer">Generated by holop.dev · ${date}</div>
</div>
</body>
</html>`;
}

export async function sendWeeklyDigestEmail(params: DigestEmailParams) {
  const to = process.env.EMAIL_TO;
  if (!to) {
    logger.error('EMAIL_TO is not configured — cannot send digest email');
    throw new Error('EMAIL_TO is not configured');
  }

  const html = buildDigestEmailHtml(params);

  const result = await getResend().emails.send({
    from: process.env.EMAIL_FROM ?? 'shoyu@holop.dev',
    to,
    subject: `Weekly AI Digest — ${params.weekLabel}`,
    html,
  });

  logger.info('Weekly digest email sent', result);
  return result;
}
