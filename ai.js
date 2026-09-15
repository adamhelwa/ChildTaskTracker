const AI = (() => {
  const KEY_STORAGE = 'ctt_openai_key';

  function getApiKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
  }
  function setApiKey(key) {
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}
  }

  async function chat(messages, { maxTokens = 300 } = {}) {
    const key = getApiKey();
    if (!key) throw new Error('no-key');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`openai-error-${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error('no-json');
    return JSON.parse(match[0]);
  }

  const AGE_TASK_LIBRARY = {
    young: [ // 6-9
      { title: 'Brush teeth', emoji: '🪥', recurrence: { type: 'daily' }, pointValue: 10 },
      { title: 'Make the bed', emoji: '🛏️', recurrence: { type: 'daily' }, pointValue: 10 },
      { title: 'Pack school bag', emoji: '🎒', recurrence: { type: 'weekdays' }, pointValue: 10 },
      { title: 'Tidy toys', emoji: '🧸', recurrence: { type: 'weekly', weekday: 0 }, pointValue: 15 },
      { title: 'Feed the pet', emoji: '🐟', recurrence: { type: 'daily' }, pointValue: 10 },
    ],
    middle: [ // 10-12
      { title: 'Homework block', emoji: '📚', recurrence: { type: 'weekdays' }, pointValue: 20 },
      { title: 'Set the table', emoji: '🍽️', recurrence: { type: 'daily' }, pointValue: 10 },
      { title: 'Walk the dog', emoji: '🐕', recurrence: { type: 'daily' }, pointValue: 15 },
      { title: 'Tidy room', emoji: '🧹', recurrence: { type: 'weekly', weekday: 6 }, pointValue: 15 },
      { title: 'Practice instrument', emoji: '🎹', recurrence: { type: 'weekdays' }, pointValue: 15 },
    ],
    teen: [ // 13-16
      { title: 'Study block', emoji: '📖', recurrence: { type: 'weekdays' }, pointValue: 25 },
      { title: 'Manage own laundry', emoji: '🧺', recurrence: { type: 'weekly', weekday: 6 }, pointValue: 20 },
      { title: 'Take out trash', emoji: '🗑️', recurrence: { type: 'weekly', weekday: 3 }, pointValue: 10 },
      { title: 'Tidy room', emoji: '🧹', recurrence: { type: 'weekly', weekday: 0 }, pointValue: 15 },
      { title: 'Prep own lunch', emoji: '🥪', recurrence: { type: 'weekdays' }, pointValue: 15 },
    ],
  };

  function ageBand(age) {
    if (age <= 9) return 'young';
    if (age <= 12) return 'middle';
    return 'teen';
  }

  async function suggestStarterTasks(name, age) {
    try {
      const content = await chat([
        { role: 'system', content: 'You suggest age-appropriate daily/weekly chores for children. Reply with ONLY a JSON array of 4-5 objects, each with keys: title (string, <=28 chars), emoji (single emoji), recurrence (one of "daily","weekdays","weekly"), pointValue (integer 5-25). No prose, no markdown fences.' },
        { role: 'user', content: `Suggest a starter chore list for ${name}, age ${age}.` },
      ], { maxTokens: 400 });
      const parsed = extractJson(content);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('bad-shape');
      return {
        source: 'ai',
        tasks: parsed.slice(0, 5).map(t => ({
          title: String(t.title || 'New task').slice(0, 28),
          recurrence: t.recurrence === 'weekly'
            ? { type: 'weekly', weekday: 0 }
            : { type: (t.recurrence === 'weekdays' ? 'weekdays' : 'daily') },
          pointValue: Math.min(30, Math.max(5, Number(t.pointValue) || 10)),
          emoji: (typeof t.emoji === 'string' && t.emoji.length <= 4 && !/[<>&]/.test(t.emoji)) ? t.emoji : '⭐',
        })),
      };
    } catch (e) {
      return { source: 'fallback', tasks: AGE_TASK_LIBRARY[ageBand(age)] };
    }
  }

  function fallbackRewardPick(child, rewards, stats) {
    const affordable = rewards.filter(r => r.active && r.pointCost <= child.points);
    const pick = affordable.sort((a, b) => b.pointCost - a.pointCost)[0]
      || rewards.filter(r => r.active).sort((a, b) => a.pointCost - b.pointCost)[0];
    if (!pick) return null;
    const frequency = stats.completionRate >= 80 ? 'weekly' : 'one-off, until the streak builds up';
    return {
      source: 'fallback',
      rewardId: pick.id,
      reason: affordable.length
        ? `${child.name} has enough points banked for ${pick.title} right now — the highest-value reward already within reach.`
        : `${pick.title} is the closest reward to reach next — ${Math.max(0, pick.pointCost - child.points)} points to go.`,
      suggestedFrequency: frequency,
    };
  }

  async function recommendReward(child, rewards, stats) {
    const active = rewards.filter(r => r.active);
    if (!active.length) return null;
    try {
      const catalog = active.map(r => ({ id: r.id, title: r.title, pointCost: r.pointCost }));
      const content = await chat([
        { role: 'system', content: 'You recommend a reward for a child from a PARENT-APPROVED list only. You must pick the "id" of exactly one item from the provided catalog — never invent a new reward, amount, or category. Reply with ONLY JSON: {"rewardId": "...", "reason": "...", "suggestedFrequency": "..."}. reason is 1-2 encouraging sentences for the parent. suggestedFrequency is a short phrase like "weekly" or "one-off".' },
        { role: 'user', content: `Child: ${child.name}, age ${child.age}. Points balance: ${child.points}. Weekly completion rate: ${stats.completionRate}%. Current streak: ${stats.streak} days. Reward catalog: ${JSON.stringify(catalog)}.` },
      ], { maxTokens: 250 });
      const parsed = extractJson(content);
      const match = active.find(r => r.id === parsed.rewardId);
      if (!match) throw new Error('id-not-in-catalog');
      return { source: 'ai', rewardId: match.id, reason: parsed.reason || '', suggestedFrequency: parsed.suggestedFrequency || '' };
    } catch (e) {
      return fallbackRewardPick(child, rewards, stats);
    }
  }

  function fallbackKpiSummary(child, stats) {
    const bits = [];
    bits.push(`${child.name} completed ${stats.completionRate}% of tasks this week`);
    if (stats.streak > 0) bits.push(`is on a ${stats.streak}-day streak`);
    if (stats.approvedThisWeek > 0) bits.push(`earned ${stats.approvedThisWeek} approved tasks`);
    return { source: 'fallback', text: bits.join(', ') + `. Points balance: ${child.points}.` };
  }

  async function kpiSummary(child, stats) {
    try {
      const content = await chat([
        { role: 'system', content: 'You write a short, warm, kid-friendly 2-sentence weekly recap for a parent to read with their child. Plain text only, no markdown, no emoji spam (at most one emoji), no mention of money or screen time.' },
        { role: 'user', content: `Child: ${child.name}, age ${child.age}. Completion rate this week: ${stats.completionRate}%. Current streak: ${stats.streak} days. Approved tasks this week: ${stats.approvedThisWeek}. Points balance: ${child.points}.` },
      ], { maxTokens: 150 });
      if (!content) throw new Error('empty');
      return { source: 'ai', text: content };
    } catch (e) {
      return fallbackKpiSummary(child, stats);
    }
  }

  return { getApiKey, setApiKey, suggestStarterTasks, recommendReward, kpiSummary, ageBand };
})();
