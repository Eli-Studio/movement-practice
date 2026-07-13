// ============================================================
// exports.js — JSON, CSV, and Markdown export
// ============================================================

import { today, formatDate } from './utils.js';
import { exportStateJSON } from './storage.js';

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

export function exportMonthCSV(sessions, missedDays, year, month, profiles = {}) {
  const pad   = n => String(n+1).padStart(2,'0');
  const fname = `movement-${year}-${pad(month)}.csv`;

  const mSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const mMissed = missedDays.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const nameA = profiles.userA?.displayName ?? 'User A';
  const nameB = profiles.userB?.displayName ?? 'User B';
  const header = ['Date','Users','Type',`${nameA} Routine`,`${nameA} Routine Type`,`${nameB} Routine`,`${nameB} Adaptation`,'Status',`${nameA} Effort`,`${nameA} Joint Discomfort`,`${nameB} Capacity`,'Meditation','Notes'].map(q).join(',') + '\n';

  let csv = header;

  for (const s of mSessions) {
    csv += [
      s.date, s.users.map(id => id === 'userA' ? nameA : id === 'userB' ? nameB : id).join('+'), s.sessionType,
      s.userARoutineId ?? '', s.userARoutineType ?? '',
      s.userBRoutineId ?? '', s.userBAdaptationLevel ?? '',
      s.status,
      s.userAEndCheckin?.formFatigue ?? '',
      s.userAEndCheckin?.jointPain   ?? '',
      s.userBCheckin?.painDay  ?? '',
      s.meditation?.completed ? `${s.meditation.durationMinutes}min` : '',
      s.notes ?? ''
    ].map(q).join(',') + '\n';
  }

  for (const m of mMissed) {
    csv += [
      m.date, m.users?.join('+') ?? 'unknown', 'missed',
      '','','','', m.category,
      '','','','', m.notes ?? ''
    ].map(q).join(',') + '\n';
  }

  downloadFile(fname, csv, 'text/csv');
  return fname;
}

export function exportMonthMarkdown(sessions, missedDays, year, month, profiles = {}) {
  const pad     = n => String(n+1).padStart(2,'0');
  const fname   = `movement-${year}-${pad(month)}.md`;
  const mName   = new Date(year, month, 1).toLocaleDateString('en-US',{ month:'long', year:'numeric' });

  const mSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const mMissed = missedDays.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const userACount = mSessions.filter(s => s.users.includes('userA')).length;
  const cCount   = mSessions.filter(s => s.users.includes('userB')).length;
  const nameA = profiles.userA?.displayName ?? 'User A';
  const nameB = profiles.userB?.displayName ?? 'User B';

  let md = `# Movement Practice — ${mName}\n\n`;
  md    += `*Exported ${formatDate(today())}*\n\n---\n\n`;
  md    += `## Summary\n\n`;
  md    += `- Total sessions: ${mSessions.length}\n`;
  md    += `- ${nameA} sessions: ${userACount}\n`;
  md    += `- ${nameB} sessions: ${cCount}\n`;
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
      md += `**Users:** ${s.users.map(id => id === 'userA' ? nameA : id === 'userB' ? nameB : id).join(', ')}\n\n`;
      if (s.users.includes('userA')) {
        md += `**${nameA}:** ${s.userARoutineId ?? 'No routine'} (${s.userARoutineType ?? ''})\n`;
        if (s.userAEndCheckin) {
          md += `- Form fatigue: ${s.userAEndCheckin.formFatigue}/5\n`;
          md += `- Joint pain: ${s.userAEndCheckin.jointPain ?? 'not recorded'}\n`;
        }
      }
      if (s.users.includes('userB')) {
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

export function exportCycleMarkdown(cycleState, sessions, profiles = {}) {
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
  md    += `## ${nameA}\n\n`;
  md    += `| Routine | Sessions |\n|---|---|\n`;
  md    += `| Upper Push | ${cycleState.userAHeavyCounts.eli_upper_push} |\n`;
  md    += `| Lower Body | ${cycleState.userAHeavyCounts.eli_lower_body} |\n`;
  md    += `| Upper Pull | ${cycleState.userAHeavyCounts.eli_upper_pull} |\n`;
  md    += `| Full Body  | ${cycleState.userAHeavyCounts.eli_full_body}  |\n`;
  md    += `| Circuit    | ${cycleState.userACircuitCount}  |\n`;
  md    += `| Cardio     | ${cycleState.userACardioCount}   |\n`;
  md    += `| Mobility   | ${cycleState.userAMobilityCount} |\n\n`;
  md    += `**Average form fatigue:** ${avgF}/5\n\n---\n\n`;
  md    += `## ${nameB}\n\n`;
  md    += `| Routine | Sessions |\n|---|---|\n`;
  const cr = cycleState.userBRoutineCounts;
  md    += `| Gentle Upper | ${cr.christina_gentle_upper ?? 0} |\n`;
  md    += `| Gentle Lower | ${cr.christina_gentle_lower ?? 0} |\n`;
  md    += `| Gentle Pull/Posture | ${cr.christina_gentle_pull_posture ?? 0} |\n`;
  md    += `| Gentle Full Body | ${cr.christina_gentle_full_body ?? 0} |\n`;
  md    += `| Light Movement | ${cr.christina_light_movement ?? 0} |\n`;
  md    += `| Recovery | ${cr.christina_recovery_minimum ?? 0} |\n\n`;

  downloadFile(fname, md, 'text/markdown');
  return fname;
}
