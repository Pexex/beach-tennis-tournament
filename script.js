/**
 * Beach Tennis Matchmaker - Refactored Logical Core
 * Version: 2.0 (Pure Code Rewrite)
 */

// --- 1. STATE & STORAGE ---
const DB_KEY = 'bt_app_state_v2';

const initialState = {
    step: 'cadastro', // cadastro | grupos | matamata
    players: [],      // ['Name 1', 'Name 2'...]
    pairs: [],        // [{ id: 1, name: 'A & B', groupId: 'A', stats: {...} }]
    groups: [],       // ['A', 'B', 'C'...]
    matches: []       // [{ id: 101, type: 'group', groupId: 'A', t1: 1, t2: 2, ... }]
};

let appState = loadState();

function loadState() {
    const stored = localStorage.getItem(DB_KEY);
    return stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(initialState));
}

function saveState() {
    localStorage.setItem(DB_KEY, JSON.stringify(appState));
    render(); // Reactive UI update
}

function resetApp() {
    if (confirm("Deseja apagar TUDO e começar novo torneio?")) {
        appState = JSON.parse(JSON.stringify(initialState));
        localStorage.removeItem(DB_KEY);
        // Clear UI inputs manually
        document.getElementById('input-jogadores').value = '';
        saveState();
    }
}

// --- 2. BUSINESS LOGIC ---

// Helper: Fisher-Yates Shuffle
function shuffleArray(arr) {
    let array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Logic: Sortear Button Click
function actionSortear() {
    const rawInput = document.getElementById('input-jogadores').value;
    const names = rawInput.split('\n').map(n => n.trim()).filter(n => n.length > 0);

    // Validation
    if (names.length < 4) {
        showModal('Erro', 'Mínimo de 4 jogadores (2 duplas) necessário.');
        return;
    }
    if (names.length % 2 !== 0) {
        showModal('Número Ímpar', 'O número de jogadores deve ser Par. Adicione ou remova alguém.');
        return;
    }

    // Execution
    appState.players = names;

    // 1. Create Pairs
    const shuffled = shuffleArray(names);
    appState.pairs = [];

    for (let i = 0; i < shuffled.length; i += 2) {
        appState.pairs.push({
            id: (i / 2) + 1,
            name: `${shuffled[i]} & ${shuffled[i + 1]}`,
            p1: shuffled[i],
            p2: shuffled[i + 1],
            groupId: null, // Will be assigned below
            stats: { points: 0, wins: 0, balance: 0, matches: 0 }
        });
    }

    // 2. Distribute into Groups
    const totalPairs = appState.pairs.length;
    let groupSizes = [];

    // Strategy: Prefer groups of 4.
    // If remainder is 1 (e.g., 5 pairs), avoid group of 5 (odd is bad for round robin, necessitates byes).
    // Actually, user said "grupos de 4 duplas e um grupo com 3 caso necessário".
    // 5 pairs: 1 group of 5? No, user prefers 3. Wait, 5 pairs -> 1 group of 5 (10 matches) is okay if desperate.
    // But 5 pairs -> 3 and 2 (invalid). So 5 must be 1 group of 5.
    // 6 pairs: 3 and 3.
    // 7 pairs: 4 and 3.
    // 8 pairs: 4 and 4.
    // 9 pairs: trim -> 3, 3, 3.
    // 10 pairs: 4, 3, 3.
    // 11 pairs: 4, 4, 3.
    // 12 pairs: 4, 4, 4.

    // Algorithm:
    // Start with all 4s.
    // Remainder 0: Perfect.
    // Remainder 1: (e.g. 5, 9, 13). 5->5 (only option). 9->3,3,3 (4,5 avoid). 13->4,3,3,3? No, 13-> 4,4,5?
    // Let's stick strictly to: "Prefer 4, fallback to 3".
    // If we have remainder, we break some 4s into 3s.
    // Check if we can satisfy with only 3s and 4s.
    // 5 is the anomaly. We can't do 3+2. So 5 is a group of 5.

    // Better Algo:
    // If total < 6, single group.

    if (totalPairs < 6) {
        groupSizes = [totalPairs];
    } else {
        // Try to maximize 4s.
        let numGroupsOf4 = Math.floor(totalPairs / 4);
        let remainder = totalPairs % 4;

        // If remainder is 0: All 4s.
        // If remainder is 1: (e.g. 9 pairs -> 2x4 + 1). Reduce 4s to make 3s?
        //    9 pairs: 2 groups of 4 leaves 1.
        //    Change one 4 to 3 -> Remainder becomes 1+1=2. (4, 3, 2) - Bad.
        //    Change two 4s to 3s -> Remainder becomes 1+2=3. (3, 3, 3). Perfect.
        //    So if rem 1, reduce count of 4-groups by 2, add 3 groups of 3.
        // If remainder is 2: (e.g. 6 pairs -> 1x4 + 2). 4 and 2 (bad).
        //    Change one 4 to 3 -> Remainder becomes 2+1=3. (3, 3). Perfect.
        // If remainder is 3: (e.g. 7 pairs -> 1x4 + 3). (4, 3). Perfect.

        if (remainder === 1) {
            if (numGroupsOf4 >= 2) {
                numGroupsOf4 -= 2;
                // rest will be filled by 3s
            } else {
                // If we can't reduce by 2 (e.g. 5 pairs -> 1x4 + 1), fallback to single group of 5.
                // But we handled < 6 already.
                // 9 pairs -> 2x4+1 -> 0x4 + 9 (3,3,3).
                // 13 pairs -> 3x4+1 -> 1x4 + 9 (4, 3, 3, 3).
            }
        } else if (remainder === 2) {
            if (numGroupsOf4 >= 1) {
                numGroupsOf4 -= 1;
                // rest will be filled by 3s
            }
        }
        // If remainder is 3, we just have one group of 3 at the end.

        // Construct sizes
        let remainingPairs = totalPairs;
        for (let i = 0; i < numGroupsOf4; i++) {
            groupSizes.push(4);
            remainingPairs -= 4;
        }
        while (remainingPairs > 0) {
            groupSizes.push(3);
            remainingPairs -= 3;
        }
    }

    // Assign Groups
    let currentPairIdx = 0;
    const groupNames = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    appState.groups = [];

    groupSizes.forEach((size, gIdx) => {
        const gName = groupNames[gIdx];
        appState.groups.push(gName);
        for (let k = 0; k < size; k++) {
            if (appState.pairs[currentPairIdx]) {
                appState.pairs[currentPairIdx].groupId = gName;
                currentPairIdx++;
            }
        }
    });

    // 3. Generate Matches (Round Robin per Group)
    appState.matches = generateGroupMatches(appState.pairs);

    appState.step = 'grupos';
    saveState();
}

function generateGroupMatches(pairsList) {
    const matches = [];
    let matchId = 1;

    // Group by ID
    const groups = {};
    pairsList.forEach(p => {
        if (!groups[p.groupId]) groups[p.groupId] = [];
        groups[p.groupId].push(p);
    });

    Object.keys(groups).forEach(gId => {
        const gPairs = groups[gId];
        const n = gPairs.length;
        // Simple Round Robin
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                matches.push({
                    id: matchId++,
                    type: 'group',
                    groupId: gId,
                    t1: gPairs[i].id,
                    t2: gPairs[j].id,
                    score1: null,
                    score2: null,
                    done: false
                });
            }
        }
    });

    return matches;
}

// Logic: Match Input
function updateMatchScore(matchId, teamIndex, value) {
    const match = appState.matches.find(m => m.id === matchId);
    if (!match) return;

    if (teamIndex === 1) match.score1 = value;
    else match.score2 = value;

    // Validate Completion
    if (match.score1 && match.score2) {
        const s1 = parseInt(match.score1);
        const s2 = parseInt(match.score2);

        if (s1 === s2) {
            showModal('Empate Proibido', 'No Beach Tennis não há empate. Jogue o tie-break!');
            // Reset that input
            if (teamIndex === 1) match.score1 = null; else match.score2 = null;
            render(); // Re-render to clear invalid input
            return;
        }

        match.done = true;

        // If Knockout, Propagate Winner
        if (match.nextId) {
            const winnerId = s1 > s2 ? match.t1 : match.t2;
            const nextMatch = appState.matches.find(m => m.id === match.nextId);
            if (nextMatch) {
                if (match.nextSlot === 1) nextMatch.t1 = winnerId;
                else nextMatch.t2 = winnerId;
                saveState();
            }
        }

        if (match.type === 'final') {
            const winnerId = s1 > s2 ? match.t1 : match.t2;
            const champion = appState.pairs.find(p => p.id === winnerId);
            if (champion) setTimeout(() => showModal('🏆 CAMPEÕES', `Parabéns ${champion.name}!`), 500);
        }

    } else {
        match.done = false;
    }

    // Always recalculate standings if group phase
    if (match.type === 'group') {
        recalculateStandings();
    }

    saveState();
}

function recalculateStandings() {
    // Reset
    appState.pairs.forEach(p => {
        p.stats = { points: 0, wins: 0, balance: 0, matches: 0 };
    });

    // Tally
    appState.matches.filter(m => m.type === 'group' && m.done).forEach(m => {
        const p1 = appState.pairs.find(p => p.id === m.t1);
        const p2 = appState.pairs.find(p => p.id === m.t2);

        const s1 = parseInt(m.score1);
        const s2 = parseInt(m.score2);

        p1.stats.matches++;
        p2.stats.matches++;

        p1.stats.balance += (s1 - s2);
        p2.stats.balance += (s2 - s1);

        if (s1 > s2) {
            p1.stats.points += 1; // 1 Point per win
            p1.stats.wins++;
        } else {
            p2.stats.points += 1;
            p2.stats.wins++;
        }
    });
}

function getSortedStandings(groupId) {
    // Filter pairs by group
    const groupPairs = appState.pairs.filter(p => p.groupId === groupId);

    return [...groupPairs].sort((a, b) => {
        // 1. Points
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
        // 2. Balance
        if (b.stats.balance !== a.stats.balance) return b.stats.balance - a.stats.balance;

        // 3. Head-to-Head (Confronto Direto)
        const match = appState.matches.find(m =>
            m.type === 'group' &&
            m.done &&
            ((m.t1 === a.id && m.t2 === b.id) || (m.t1 === b.id && m.t2 === a.id))
        );

        if (match) {
            const s1 = parseInt(match.score1);
            const s2 = parseInt(match.score2);
            const winnerId = s1 > s2 ? match.t1 : match.t2;
            if (winnerId === a.id) return -1;
            if (winnerId === b.id) return 1;
        }

        // 4. Wins (Fallback)
        return b.stats.wins - a.stats.wins;
    });
}

// Logic: Sun Mode
function toggleSunMode() {
    document.body.classList.toggle('sun-mode');
    // Simple persistence for preference ?? Not strict requirement but nice.
}

// Logic: Generate Knockout
function actionGenerateKnockout() {
    // Check if pending matches
    const pending = appState.matches.some(m => m.type === 'group' && !m.done);
    if (pending) {
        if (!confirm("Ainda há jogos em aberto. Prosseguir assim mesmo?")) return;
    }

    if (appState.matches.some(m => !['group'].includes(m.type))) {
        appState.step = 'matamata';
        saveState();
        return;
    }

    // 1. Collect Qualifiers (Top 2 from each group)
    let qualifiers = [];
    appState.groups.forEach(gId => {
        const sorted = getSortedStandings(gId);
        if (sorted.length >= 1) qualifiers.push({ ...sorted[0], place: 1, origin: gId });
        if (sorted.length >= 2) qualifiers.push({ ...sorted[1], place: 2, origin: gId });
    });

    if (qualifiers.length < 2) {
        showModal('Erro', 'Poucos jogadores classificados para criar um mata-mata.');
        return;
    }

    // 2. Global Seeding
    // Sort qualifiers to determine seeds: Place 1s first, sorted by points/balance. Then Place 2s.
    qualifiers.sort((a, b) => {
        if (a.place !== b.place) return a.place - b.place; // 1st places before 2nd places
        // Tie-breakers within same place rank
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
        return b.stats.balance - a.stats.balance;
    });

    // 3. Generate Bracket
    const newMatches = generateBracketTree(qualifiers);

    appState.matches.push(...newMatches);
    appState.step = 'matamata';
    saveState();
}

function actionExport() {
    const data = JSON.stringify(appState);
    navigator.clipboard.writeText(data).then(() => {
        showModal('Backup Exportado', 'Os dados do torneio foram copiados para a área de transferência. Cole em um bloco de notas ou envie por WhatsApp para salvar.');
    }).catch(err => {
        showModal('Erro', 'Não foi possível copiar automaticamente. Tente novamente.');
        console.error(err);
    });
}

function actionImport() {
    // Simple prompt for now
    const input = prompt("Cole aqui o código de backup (JSON) do torneio:");
    if (!input) return;

    try {
        const data = JSON.parse(input);
        // Basic validation
        if (!data.step || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
            throw new Error("Formato inválido");
        }

        if (confirm("Isso substituirá TODOS os dados atuais. Tem certeza?")) {
            appState = data;
            saveState();
            render();
            showModal('Sucesso', 'Torneio restaurado com sucesso!');
        }
    } catch (e) {
        showModal('Erro ao Importar', 'O código colado não é válido. Verifique se copiou corretamente.');
    }
}

// Logic: Minimal Bye Bracket Generator
function generateBracketTree(participants) {
    let matchIdCounter = 1000;
    const allMatches = [];

    // We simulate matches round by round until 1 winner remains.
    // rounds structure: [ [matchOrBye, matchOrBye], ... ]

    // Structure to track current active players/slots
    // Each item is an object: { id: 'pId' or null, originId: 1001 (prevMatchId) or null }
    let currentPool = participants.map(p => ({
        id: p.id,
        name: p.name,
        originMatchId: null,
        originSlot: null
    }));

    let roundLevel = 10; // Start high, decrement? Or just generic ID
    let rounds = []; // To store created matches per round to assign labels later

    while (currentPool.length > 1) {
        const roundMatches = [];
        const nextPool = []; // Winners of this round go here

        // Sort Pool? It should be sorted by seed initially.
        // Assuming 'participants' passed in is already sorted seeds 1..N.

        let poolToPair = [...currentPool];

        // Handle Odd Number -> Top Seed gets Bye
        if (poolToPair.length % 2 !== 0) {
            const byePlayer = poolToPair.shift(); // Top seed (Index 0)

            // Create a "Bye Match" for visualization or just pass through?
            // User liked "Classificado" card. Let's create a completed match for consistency in tracking.
            const byeMatch = {
                id: matchIdCounter++,
                roundIndex: rounds.length,
                type: 'bye_placeholder', // ID only
                label: 'Classificado',
                t1: byePlayer.id, t2: null,
                score1: 0, score2: 0,
                done: true,
                winnerId: byePlayer.id,
                isBye: true
            };

            // If this player came from a previous match, link it
            if (byePlayer.originMatchId) {
                const prev = allMatches.find(m => m.id === byePlayer.originMatchId);
                if (prev) {
                    if (byePlayer.originSlot === 1) prev.nextId = byeMatch.id; // Wait, byes dont really start matches?
                    // Actually, if I win R1, and get Bye in R2.
                    // My R1 match should point to... The next match I play (R3)? 
                    // Or do we represent the Bye as a visible staging step?
                    // User liked the visual "Classificado" card. So yes, generate a match object.

                    // BUT, a Bye Card only has 1 input. Standard match has 2.
                    // My `createBracketElement` handles `match.label === 'Classificado'` specially.
                    // But it expects `match.winnerId`.

                    // Linkage:
                    if (byePlayer.originSlot === 1) prev.nextLink = { id: byeMatch.id, slot: 1 }; // Custom linking needed?
                    // Standard system uses nextId/nextSlot on the PREVIOUS match.
                    if (byePlayer.originSlot === 1) prev.nextId = byeMatch.id;
                    else prev.nextId = byeMatch.id;
                    // Note: Bye match only has 1 slot effectively.
                    prev.nextSlot = 1;
                }
            }

            roundMatches.push(byeMatch);
            allMatches.push(byeMatch);

            // Pass to next round
            nextPool.push({
                id: byePlayer.id,
                name: byePlayer.name,
                originMatchId: byeMatch.id,
                originSlot: 1 // Winner is always t1/t2 generic
            });
        }

        // Pair the rest (Standard High vs Low)
        // 1 vs N, 2 vs N-1...
        // poolToPair is the remaining even set.
        const half = poolToPair.length / 2;
        for (let i = 0; i < half; i++) {
            const high = poolToPair[i];
            const low = poolToPair[poolToPair.length - 1 - i];

            const match = {
                id: matchIdCounter++,
                roundIndex: rounds.length,
                type: 'tbd', // Will name later
                label: 'Jogo',
                t1: high.id,
                t2: low.id,
                score1: null, score2: null,
                done: false,
                isBye: false,
                winnerId: null
            };

            // Link predecessors
            if (high.originMatchId) {
                const prev = allMatches.find(m => m.id === high.originMatchId);
                if (prev) { prev.nextId = match.id; prev.nextSlot = 1; }
            }
            if (low.originMatchId) {
                const prev = allMatches.find(m => m.id === low.originMatchId);
                if (prev) { prev.nextId = match.id; prev.nextSlot = 2; }
            }

            roundMatches.push(match);
            allMatches.push(match);

            // Add placeholder for winner to next pool
            nextPool.push({
                id: null, // Unknown yet
                name: 'Vencedor',
                originMatchId: match.id,
                originSlot: 1 // Doesn't matter for next match inputs usually, but we need to track if its p1 or p2
            });
        }

        rounds.push(roundMatches);
        currentPool = nextPool;
    }

    // Naming Rounds (Backwards)
    // Rounds array: [R1, R2, R3... Final]
    // Last one is Final.
    if (rounds.length > 0) {
        assignRoundNames(rounds);
    }

    return allMatches;
}

function assignRoundNames(rounds) {
    const total = rounds.length;
    rounds.forEach((roundMatches, idx) => {
        // level 0 = Final (last index)
        const level = (total - 1) - idx;

        let typeName = 'eliminatoria';
        if (level === 0) typeName = 'final';
        if (level === 1) typeName = 'semi';
        if (level === 2) typeName = 'quartas';
        if (level === 3) typeName = 'oitavas';

        roundMatches.forEach((m, mIdx) => {
            m.type = typeName;
            if (m.isBye) {
                m.label = 'Classificado';
            } else {
                if (typeName === 'final') m.label = 'GRANDE FINAL';
                else m.label = `${formatRoundName(typeName)} ${mIdx + 1}`;
            }
        });
    });
}

function formatRoundName(key) {
    if (key === 'semi') return 'Semifinal';
    return key.charAt(0).toUpperCase() + key.slice(1);
}

function getRoundName(numPlayers, unused) {
    if (numPlayers === 2) return 'final';
    if (numPlayers === 4) return 'semi';
    if (numPlayers === 8) return 'quartas';
    if (numPlayers === 16) return 'oitavas';
    return 'eliminatoria';
}

// --- 3. UI/DOM MANIPULATION ---

const UI = {
    screens: {},
    nav: null,
    inputs: {},
    lists: {},
    modal: null
};

function render() {
    // Safety check if UI not init
    if (!UI.nav) return;

    // 1. Navigation Visibility
    if (appState.step === 'cadastro') UI.nav.classList.add('hidden');
    else UI.nav.classList.remove('hidden');

    // 2. Screen Switching
    Object.values(UI.screens).forEach(el => el && el.classList.add('hidden'));
    if (UI.screens[appState.step]) UI.screens[appState.step].classList.remove('hidden');

    // 3. Content Rendering based on Step
    if (appState.step === 'cadastro') {
        renderPlayerCount();
    } else if (appState.step === 'grupos') {
        renderGroupMatches();
        renderStandings();
    } else if (appState.step === 'matamata') {
        renderKnockout();
    }
}

function renderPlayerCount() {
    if (!UI.inputs.jogadores) return;
    const txt = UI.inputs.jogadores.value || '';
    // Filter empty lines
    const count = txt.split('\n').filter(x => x.trim().length > 0).length;
    const badge = document.getElementById('player-count');
    if (badge) badge.textContent = `${count} jogadores`;
}

function renderGroupMatches() {
    const list = UI.lists.groupMatches;
    list.innerHTML = '';

    if (appState.groups.length === 0) { list.innerHTML = 'Sem jogos.'; return; }

    appState.groups.forEach(groupId => {
        // Group Header
        const header = document.createElement('h4');
        header.textContent = `Grupo ${groupId}`;
        header.style.marginTop = '15px';
        header.style.marginBottom = '10px';
        list.appendChild(header);

        const groupsMatches = appState.matches.filter(m => m.type === 'group' && m.groupId === groupId);
        groupsMatches.forEach(m => {
            const el = createMatchElement(m);
            list.appendChild(el);
        });
    });
}

function renderStandings() {
    const container = document.querySelector('.table-wrapper');
    container.innerHTML = '';

    appState.groups.forEach(groupId => {
        // Group Header
        const header = document.createElement('h4');
        header.textContent = `Classificação - Grupo ${groupId}`;
        header.style.marginTop = '20px';
        header.style.marginBottom = '10px';
        container.appendChild(header);

        // Create Table
        const table = document.createElement('table');
        table.className = 'standings-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Pos</th>
                    <th>Dupla</th>
                    <th title="Pontos">Pts</th>
                    <th title="Jogos">J</th>
                    <th title="Vitórias">V</th>
                    <th title="Saldo de Games">SG</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        const sorted = getSortedStandings(groupId);

        sorted.forEach((p, idx) => {
            const tr = document.createElement('tr');
            // Highlight top 2
            if (idx < 2) tr.style.backgroundColor = 'rgba(204, 255, 0, 0.1)';

            tr.innerHTML = `
                <td>#${idx + 1}</td>
                <td>${p.name}</td>
                <td><strong>${p.stats.points}</strong></td>
                <td>${p.stats.matches}</td>
                <td>${p.stats.wins}</td>
                <td>${p.stats.balance}</td>
            `;
            tbody.appendChild(tr);
        });

        container.appendChild(table);
    });
}

function renderKnockout() {
    const container = document.querySelector('.bracket-container');
    container.innerHTML = '';

    // Identify rounds present
    const roundOrder = ['oitavas', 'quartas', 'semi', 'final'];
    // Filter matches
    const knockoutMatches = appState.matches.filter(m => roundOrder.includes(m.type) || m.type === 'eliminatoria');

    // Group by type
    const groups = {};
    knockoutMatches.forEach(m => {
        if (!groups[m.type]) groups[m.type] = [];
        groups[m.type].push(m);
    });

    // Render columns in order
    roundOrder.forEach(rType => {
        if (groups[rType] && groups[rType].length > 0) {
            const col = document.createElement('div');
            col.className = 'bracket-round';
            col.style.minWidth = '250px';

            // Add Header
            const header = document.createElement('h3');
            header.textContent = rType.toUpperCase();
            header.style.textAlign = 'center';
            header.style.marginBottom = '20px';
            header.style.fontSize = '1rem';
            header.style.color = '#888';
            col.appendChild(header);

            // Sort matches by ID
            groups[rType].sort((a, b) => a.id - b.id).forEach(m => {
                col.appendChild(createBracketElement(m));
            });
            container.appendChild(col);
        }
    });
}

// UI helper: Create Match Card (used in Group)
function createMatchElement(match) {
    const t1 = appState.pairs.find(p => p.id === match.t1);
    const t2 = appState.pairs.find(p => p.id === match.t2);

    const div = document.createElement('div');
    div.className = `match-card ${match.done ? 'completed' : ''}`;

    div.innerHTML = `
        <div class="team-name" title="${t1.name}">${t1.name}</div>
        <div class="score-board">
            <input type="number" class="score-input" value="${match.score1 || ''}" 
                   onchange="updateMatchScore(${match.id}, 1, this.value)" placeholder="-">
            <span class="vs-divider">x</span>
            <input type="number" class="score-input" value="${match.score2 || ''}" 
                   onchange="updateMatchScore(${match.id}, 2, this.value)" placeholder="-">
        </div>
        <div class="team-name right" title="${t2.name}">${t2.name}</div>
    `;
    return div;
}

// UI helper: Create Bracket Card
function createBracketElement(match) {
    // Special handling for Byes/Direct Qualification
    if (match.label === 'Classificado') {
        const winnerId = match.winnerId || (match.t1 || match.t2);
        const winner = appState.pairs.find(p => p.id === winnerId) || { name: '...' };

        const div = document.createElement('div');
        div.className = `bracket-card completed bye-card`;
        div.style.opacity = '70%';
        div.style.borderStyle = 'dashed';

        div.innerHTML = `
            <span class="label" style="text-align:center; display:block; color:var(--color-primary-hover); margin-bottom:5px;">Classificado</span>
            <div style="text-align:center; font-weight:700;">${winner.name}</div>
            <div style="text-align:center; font-size:0.8rem; color:#888; margin-top:5px;">Avança direto</div>
        `;
        return div;
    }

    const t1 = appState.pairs.find(p => p.id === match.t1) || { name: 'A definir...' };
    const t2 = appState.pairs.find(p => p.id === match.t2) || { name: 'A definir...' };

    const div = document.createElement('div');
    div.className = `bracket-card ${match.done ? 'completed' : ''}`;
    div.innerHTML = `
        <span class="label">${match.label}</span>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-weight:600; font-size:0.9rem;">${t1.name}</span>
            <input type="number" class="score-input" style="width:35px; height:35px; font-size:1rem;" 
                   value="${match.score1 || ''}" 
                   onchange="updateMatchScore(${match.id}, 1, this.value)"
                   ${match.done ? '' : ''}>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; font-size:0.9rem;">${t2.name}</span>
            <input type="number" class="score-input" style="width:35px; height:35px; font-size:1rem;" 
                   value="${match.score2 || ''}" 
                   onchange="updateMatchScore(${match.id}, 2, this.value)"
                   ${match.done ? '' : ''}>
        </div>
    `;
    return div;
}

// Modal System
function showModal(title, text) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = text;
    UI.modal.classList.remove('hidden');
}

document.getElementById('btn-modal-close').onclick = () => {
    UI.modal.classList.add('hidden');
};

// --- 4. INITIALIZATION & EVENTS ---
function init() {
    // Initialize UI Cache here to ensure DOM is ready
    UI.screens = {
        cadastro: document.getElementById('view-cadastro'),
        grupos: document.getElementById('view-grupos'),
        matamata: document.getElementById('view-matamata')
    };
    UI.nav = document.getElementById('app-nav');
    UI.inputs = {
        jogadores: document.getElementById('input-jogadores')
    };
    UI.lists = {
        groupMatches: document.getElementById('group-matches-list'),
        standings: document.querySelector('#standings-table tbody'),
        semis: document.getElementById('bracket-semis'),
        final: document.getElementById('bracket-final')
    };
    UI.modal = document.getElementById('custom-modal');

    // Buttons
    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) btnSortear.onclick = actionSortear;

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) btnReset.onclick = resetApp;

    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.onclick = actionExport;

    const btnImport = document.getElementById('btn-import');
    if (btnImport) btnImport.onclick = actionImport;

    const btnImportHome = document.getElementById('btn-import-home');
    if (btnImportHome) btnImportHome.onclick = actionImport;

    const btnGoKnockout = document.getElementById('btn-go-knockout');
    if (btnGoKnockout) btnGoKnockout.onclick = actionGenerateKnockout;

    const btnSun = document.getElementById('btn-sun-mode');
    if (btnSun) btnSun.onclick = toggleSunMode;

    const btnBackGroups = document.getElementById('btn-back-groups');
    if (btnBackGroups) {
        btnBackGroups.onclick = () => {
            // Force return to groups
            appState.step = 'grupos';
            saveState();
        };
    }

    // Modal Close
    const btnModalClose = document.getElementById('btn-modal-close');
    if (btnModalClose) btnModalClose.onclick = () => UI.modal.classList.add('hidden');

    // Inputs
    if (UI.inputs.jogadores) {
        UI.inputs.jogadores.addEventListener('input', renderPlayerCount);
        // Initial Count
        if (appState.step === 'cadastro') renderPlayerCount();
    }

    // Initial Render
    if (appState.step === 'cadastro' && appState.players.length > 0 && UI.inputs.jogadores) {
        UI.inputs.jogadores.value = appState.players.join('\n');
    }
    render();
}

// Run
window.addEventListener('DOMContentLoaded', init);
window.updateMatchScore = updateMatchScore; // Expose to global scope for HTML inline events
