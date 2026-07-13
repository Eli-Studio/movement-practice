// ============================================================
// exports.js — JSON, CSV, and Markdown export
// ============================================================

import { today, formatDate } from './utils.js';
import { exportStateJSON } from './storage.js?v=2';

// Quoting protects CSV structure; the leading apostrophe also prevents
// spreadsheet apps from evaluating user-controlled cells as formulas.
export function escapeCSVCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFullBackupJSON(state) {
  const filename = `movement-backup-${today()}.json`;
  downloadFile(filename, exportStateJSON(state), 'application/json');
  return filename;
}

export function exportMonthCSV(sessions, missedDays, year, month, profiles = {}, activeProfileIds = ['userA', 'userB']) {
  const pad   = n => String(n+1).padStart(2,'0');
  const fname = `movement-${year}-${pad(month)}.csv`;

  const mSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month
      && s.users.some(id => activeProfileIds.includes(id));
  });
  const mMissed = missedDays.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month
      && (m.users ?? []).some(id => activeProfileIds.includes(id));
  });

  const q = escapeCSVCell;
  const nameA = profiles.userA?.displayName ?? 'User A';
  const nameB = profiles.userB?.displayName ?? 'User B';
  const profileHeaders = activeProfileIds.flatMap(id => id === 'userA'
    ? [`${nameA} Routine`, `${nameA} Routine Type`, `${nameA} Effort`, `${nameA} Joint Discomfort`]
    : [`${nameB} Routine`, `${nameB} Adaptation`, `${nameB} Capacity`]);
  const profileValues = s => activeProfileIds.flatMap(id => id === 'userA'
    ? [s.userARoutineId ?? '', s.userARoutineType ?? '', s.userAEndCheckin?.formFatigue ?? '', s.userAEndCheckin?.jointPain ?? '']
    : [s.userBRoutineId ?? '', s.userBAdaptationLevel ?? '', s.userBCheckin?.painDay ?? '']);
  const header = ['Date','Users','Type', ...profileHeaders, 'Status','Meditation','Notes'].map(q).join(',') + '\n';

  let csv = header;

  for (const s of mSessions) {
    csv += [
      s.date, s.users.filter(id => activeProfileIds.includes(id)).map(id => id === 'userA' ? nameA : id === 'userB' ? nameB : id).join('+'), s.sessionType,
      ...profileValues(s), s.status,
      s.meditation?.completed ? `${s.meditation.durationMinutes}min` : '',
      s.notes ?? ''
    ].map(q).join(',') + '\n';
  }

  for (const m of mMissed) {
    csv += [
      m.date, (m.users ?? []).filter(id => activeProfileIds.includes(id)).map(id => id === 'userA' ? nameA : id === 'userB' ? nameB : id).join('+') || 'unknown', 'missed',
      ...profileHeaders.map(() => ''), m.category, '', m.notes ?? ''
    ].map(q).join(',') + '\n';
  }

  downloadFile(fname, csv, 'text/csv');
  return fname;
}

export function exportMonthMarkdown(sessions, missedDays, year, month, profiles = {}, activeProfileIds = ['userA', 'userB']) {
  const pad     = n => String(n+1).padStart(2,'0');
  const fname   = `movement-${year}-${pad(month)}.md`;
  const mName   = new Date(year, month, 1).toLocaleDateString('en-US',{ month:'long', year:'numeric' });

  const mSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month
      && s.users.some(id => activeProfileIds.includes(id));
  });
  const mMissed = missedDays.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month
      && (m.users ?? []).some(id => activeProfileIds.includes(id));
  });

  const userACount = mSessions.filter(s => s.users.includes('userA')).length;
  const userBCount   = mSessions.filter(s => s.users.includes('userB')).length;
  const nameA = profiles.userA?.displayName ?? 'User A';
  const nameB = profiles.userB?.displayName ?? 'User B';

  let md = `# Movement Practice — ${mName}\n\n`;
  md    += `*Exported ${formatDate(today())}*\n\n---\n\n`;
  md    += `## Summary\n\n`;
  md    += `- Total sessions: ${mSessions.length}\n`;
  if (activeProfileIds.includes('userA')) md += `- ${nameA} sessions: ${userACount}\n`;
  if (activeProfileIds.includes('userB')) md += `- ${nameB} sessions: ${userBCount}\n`;
  md    += `- Missed / other days: ${mMissed.length}\n\n---\n\n`;
  md    += `## Session Log\n\n`;

  const all = [
    ...mSessions.map(s => ({ date: s.date, kind: 'session', data: s })),
    ...mMissed.map(m =>   ({ date: m.date, kind: 'missed',  data: m }))
  ].sort((a,b) => a.date.localeCompare(b.date));

  for (const entry of all) {
    if (entry.kind === 'session') {
      const s = entry.data;
      md += `### ${formatDate(s.date)}\n\n`;
      md += `**Users:** ${s.users.filter(id => activeProfileIds.includes(id)).map(id => id === 'userA' ? nameA : id === 'userB' ? nameB : id).join(', ')}\n\n`;
      if (activeProfileIds.includes('userA') && s.users.includes('userA')) {
        md += `**${nameA}:** ${s.userARoutineId ?? 'No routine'} (${s.userARoutineType ?? ''})\n`;
        if (s.userAEndCheckin) {
          md += `- Form fatigue: ${s.userAEndCheckin.formFatigue}/5\n`;
          md += `- Joint pain: ${s.userAEndCheckin.jointPain ?? 'not recorded'}\n`;
        }
      }
      if (activeProfileIds.includes('userB') && s.users.includes('userB')) {
        md += `**${nameB}:** ${s.userBRoutineId ?? 'No routine'} (${s.userBAdaptationLevel ?? ''})\n`;
        if (s.userBCheckin?.painDay) md += `- Pain day: ${s.userBCheckin.painDay}\n`;
      }
      if (s.meditation?.completed) md += `**Meditation:** ${s.meditation.durationMinutes} minutes\n`;
      if (s.notes) md += `**Notes:** ${s.notes}\n`;
      md += '\n';
    } else {
      const m = entry.data;
      md += `### ${formatDate(m.date)}\n\n`;
      md += `**Logged as:** ${m.category.replace(/_/g,' ')}\n`;
      if (m.notes) md += `**Notes:** ${m.notes}\n`;
      md += '\n';
    }
  }

  downloadFile(fname, md, 'text/markdown');
  return fname;
}

export function exportCycleMarkdown(cycleState, sessions, profiles = {}, activeProfileIds = ['userA', 'userB']) {
  const fname = `movement-${cycleState.cycleId}.md`;

  const cycleSessions = sessions.filter(s =>
    s.date >= cycleState.startDate && s.date <= cycleState.endDate
  );

  const fatigue = cycleSessions.map(s => s.userAEndCheckin?.formFatigue).filter(Boolean);
  const avgF    = fatigue.length
    ? (fatigue.reduce((a,b) => a+b,0) / fatigue.length).toFixed(1)
    : 'N/A';
  const nameA = profiles.userA?.displayName ?? 'User A';
  const nameB = profiles.userB?.displayName ?? 'User B';

  let md = `# Cycle Review — ${cycleState.cycleId} (Cycle ${cycleState.cycleNumber})\n\n`;
  md    += `**Period:** ${formatDate(cycleState.startDate)} → ${formatDate(cycleState.endDate)}\n\n---\n\n`;
  if (activeProfileIds.includes('userA')) {
    md += `## ${nameA}\n\n`;
    md += `| Routine | Sessions |\n|---|---|\n`;
    md += `| Upper Push | ${cycleState.userAHeavyCounts.strength_upper_push} |\n`;
    md += `| Lower Body | ${cycleState.userAHeavyCounts.strength_lower_body} |\n`;
    md += `| Upper Pull | ${cycleState.userAHeavyCounts.strength_upper_pull} |\n`;
    md += `| Full Body  | ${cycleState.userAHeavyCounts.strength_full_body}  |\n`;
    md += `| Circuit    | ${cycleState.userACircuitCount}  |\n`;
    md += `| Cardio     | ${cycleState.userACardioCount}   |\n`;
    md += `| Mobility   | ${cycleState.userAMobilityCount} |\n\n`;
    md += `**Average form fatigue:** ${avgF}/5\n\n`;
  }
  if (activeProfileIds.length === 2) md += `---\n\n`;
  if (activeProfileIds.includes('userB')) {
    const cr = cycleState.userBRoutineCounts;
    md += `## ${nameB}\n\n`;
    md += `| Routine | Sessions |\n|---|---|\n`;
    md += `| Gentle Upper | ${cr.adaptive_gentle_upper ?? 0} |\n`;
    md += `| Gentle Lower | ${cr.adaptive_gentle_lower ?? 0} |\n`;
    md += `| Gentle Pull/Posture | ${cr.adaptive_gentle_pull_posture ?? 0} |\n`;
    md += `| Gentle Full Body | ${cr.adaptive_gentle_full_body ?? 0} |\n`;
    md += `| Light Movement | ${cr.adaptive_light_movement ?? 0} |\n`;
    md += `| Recovery | ${cr.adaptive_recovery_minimum ?? 0} |\n\n`;
  }

  downloadFile(fname, md, 'text/markdown');
  return fname;
}
