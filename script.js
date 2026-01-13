/**
 * Beach Tennis Matchmaker - Refactored Logical Core
 * Version: 2.0 (Pure Code Rewrite)
 */

// --- 1. STATE & STORAGE ---
const DB_KEY = 'bt_app_state_v2';

const initialState = {
    step: 'cadastro', // cadastro | grupos | matamata
    players: [],      // ['Name 1', 'Name 2'...]
    pairs: [],        // [{ id: 1, name: 'A & B', p1: 'A', p2: 'B', stats: { points: 0, wins: 0, balance: 0, matches: 0 } }]
    matches: []       // [{ id: 101, type: 'group', t1: 1, t2: 2, score1: null, score2: null, done: false, nextId: null, nextSlot: null }]
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
            stats: { points: 0, wins: 0, balance: 0, matches: 0 }
        });
    }

    // 2. Generate Group Schedule (Round Robin)
    appState.matches = generateRoundRobin(appState.pairs);

    appState.step = 'grupos';
    saveState();
}

function generateRoundRobin(pairsList) {
    const matches = [];
    const n = pairsList.length;
    let matchId = 1;

    // Simple Round Robin for small number of pairs (e.g. 4 to 8)
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            matches.push({
                id: matchId++,
                type: 'group',
                t1: pairsList[i].id,
                t2: pairsList[j].id,
                score1: null,
                score2: null,
                done: false
            });
        }
    }
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
        if (match.type === 'semi') {
            const winnerId = s1 > s2 ? match.t1 : match.t2;
            const nextMatch = appState.matches.find(m => m.id === match.nextId);
            if (nextMatch) {
                if (match.nextSlot === 1) nextMatch.t1 = winnerId;
                else nextMatch.t2 = winnerId;
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

function getSortedStandings() {
    return [...appState.pairs].sort((a, b) => {
        // 1. Points
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
        // 2. Balance
        if (b.stats.balance !== a.stats.balance) return b.stats.balance - a.stats.balance;

        // 3. Head-to-Head (Confronto Direto)
        // Find match between A and B
        const match = appState.matches.find(m =>
            m.type === 'group' &&
            m.done &&
            ((m.t1 === a.id && m.t2 === b.id) || (m.t1 === b.id && m.t2 === a.id))
        );

        if (match) {
            const s1 = parseInt(match.score1);
            const s2 = parseInt(match.score2);
            // Determine winner of match
            const winnerId = s1 > s2 ? match.t1 : match.t2;
            if (winnerId === a.id) return -1; // A wins -> A comes first (lower index)
            if (winnerId === b.id) return 1;  // B wins -> B comes first
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

    if (appState.matches.some(m => m.type === 'semi')) {
        appState.step = 'matamata';
        saveState();
        return;
    }

    const ranked = getSortedStandings();
    if (ranked.length < 4) {
        showModal('Erro', 'Menos de 4 duplas. Impossível fazer semifinais.');
        return;
    }

    // Create matches
    // Semi 1: 1st vs 4th
    // Semi 2: 2nd vs 3rd
    // Final

    // IDs: Use high numbers. Semi 1001, 1002. Final 2001.
    const semi1 = {
        id: 1001, type: 'semi', label: 'Semifinal 1',
        t1: ranked[0].id, t2: ranked[3].id,
        score1: null, score2: null, done: false,
        nextId: 2001, nextSlot: 1
    };

    const semi2 = {
        id: 1002, type: 'semi', label: 'Semifinal 2',
        t1: ranked[1].id, t2: ranked[2].id,
        score1: null, score2: null, done: false,
        nextId: 2001, nextSlot: 2
    };

    const finalMatch = {
        id: 2001, type: 'final', label: 'GRANDE FINAL',
        t1: null, t2: null, // winners will fill this
        score1: null, score2: null, done: false
    };

    appState.matches.push(semi1, semi2, finalMatch);
    appState.step = 'matamata';
    saveState();
}

// --- 3. UI/DOM MANIPULATION ---

const UI = {
    screens: {
        cadastro: document.getElementById('view-cadastro'),
        grupos: document.getElementById('view-grupos'),
        matamata: document.getElementById('view-matamata')
    },
    nav: document.getElementById('app-nav'),
    inputs: {
        jogadores: document.getElementById('input-jogadores')
    },
    lists: {
        groupMatches: document.getElementById('group-matches-list'),
        standings: document.querySelector('#standings-table tbody'),
        semis: document.getElementById('bracket-semis'),
        final: document.getElementById('bracket-final')
    },
    modal: document.getElementById('custom-modal')
};

function render() {
    // 1. Navigation Visibility
    if (appState.step === 'cadastro') UI.nav.classList.add('hidden');
    else UI.nav.classList.remove('hidden');

    // 2. Screen Switching
    Object.values(UI.screens).forEach(el => el.classList.add('hidden'));
    UI.screens[appState.step].classList.remove('hidden');

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
    const txt = UI.inputs.jogadores.value || '';
    const count = txt.split('\n').filter(x => x.trim()).length;
    document.getElementById('player-count').textContent = `${count} jogadores`;
}

function renderGroupMatches() {
    const list = UI.lists.groupMatches;
    list.innerHTML = '';

    const groups = appState.matches.filter(m => m.type === 'group');
    if (groups.length === 0) { list.innerHTML = 'Sem jogos.'; return; }

    groups.forEach(m => {
        const el = createMatchElement(m);
        list.appendChild(el);
    });
}

function renderStandings() {
    const tbody = UI.lists.standings;
    tbody.innerHTML = '';

    const sorted = getSortedStandings();
    sorted.forEach((p, idx) => {
        const tr = document.createElement('tr');
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
}

function renderKnockout() {
    UI.lists.semis.innerHTML = '';
    UI.lists.final.innerHTML = '';

    const semis = appState.matches.filter(m => m.type === 'semi');
    const final = appState.matches.find(m => m.type === 'final');

    semis.forEach(m => UI.lists.semis.appendChild(createBracketElement(m)));
    if (final) UI.lists.final.appendChild(createBracketElement(final));
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
                   onchange="updateMatchScore(${match.id}, 1, this.value)">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; font-size:0.9rem;">${t2.name}</span>
            <input type="number" class="score-input" style="width:35px; height:35px; font-size:1rem;" 
                   value="${match.score2 || ''}" 
                   onchange="updateMatchScore(${match.id}, 2, this.value)">
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
    // Buttons
    document.getElementById('btn-sortear').onclick = actionSortear;
    document.getElementById('btn-reset').onclick = resetApp;
    document.getElementById('btn-go-knockout').onclick = actionGenerateKnockout;
    document.getElementById('btn-sun-mode').onclick = toggleSunMode;
    document.getElementById('btn-back-groups').onclick = () => {
        // Simple View toggle without state change, just for peeking
        document.getElementById('view-matamata').classList.add('hidden');
        document.getElementById('view-grupos').classList.remove('hidden');
    };

    // Inputs
    UI.inputs.jogadores.addEventListener('input', renderPlayerCount);

    // Initial Render
    if (appState.step === 'cadastro' && appState.players.length > 0) {
        UI.inputs.jogadores.value = appState.players.join('\n');
    }
    render();
}

// Run
window.addEventListener('DOMContentLoaded', init);
window.updateMatchScore = updateMatchScore; // Expose to global scope for HTML inline events
