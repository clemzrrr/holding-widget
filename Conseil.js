// Widget « Conseil des Unités » pour Scriptable (iPhone)
// Taille : moyenne. Lit le fichier status.json du dépôt GitHub privé
// « holding-widget », mis à jour par l'orchestrateur à chaque exécution.
// Ton jeton GitHub (lecture seule) est rangé dans le trousseau de l'iPhone,
// jamais dans ce script.

const REPO = "holding-widget";
const FICHIER = "status.json";
const TABLEAU_DE_BORD = "https://claude.ai/artifact/1SKtT1spzwYX5ryikgFHra";
const K_TOKEN = "holding_gh_token";
const K_OWNER = "holding_gh_owner";

const C = {
  fond: new Color("#0F1513"),
  carte: new Color("#172019"),
  texte: new Color("#E6ECE8"),
  doux: new Color("#93A29A"),
  vert: new Color("#5CC497"),
  rouge: new Color("#E57A6C"),
  orange: new Color("#E1A94B"),
};

// ---------- Configuration (première ouverture dans l'app) ----------
async function configurer(forcer) {
  if (!forcer && Keychain.contains(K_TOKEN) && Keychain.contains(K_OWNER)) return;
  const a = new Alert();
  a.title = "Configuration du widget";
  a.message = "Ton nom d'utilisateur GitHub et ton jeton en lecture seule (limité au dépôt holding-widget). Ils restent dans le trousseau de ton iPhone.";
  a.addTextField("Nom d'utilisateur GitHub", Keychain.contains(K_OWNER) ? Keychain.get(K_OWNER) : "");
  a.addSecureTextField("Jeton GitHub (github_pat_…)", "");
  a.addAction("Enregistrer");
  a.addCancelAction("Annuler");
  const r = await a.presentAlert();
  if (r === -1) return;
  const owner = a.textFieldValue(0).trim();
  const token = a.textFieldValue(1).trim();
  if (owner) Keychain.set(K_OWNER, owner);
  if (token) Keychain.set(K_TOKEN, token);
}

// ---------- Lecture des données ----------
async function lireStatut() {
  if (!Keychain.contains(K_TOKEN) || !Keychain.contains(K_OWNER)) {
    throw new Error("Widget non configuré : ouvre le script dans Scriptable.");
  }
  const owner = Keychain.get(K_OWNER);
  const req = new Request(`https://api.github.com/repos/${owner}/${REPO}/contents/${FICHIER}`);
  req.headers = {
    "Authorization": `Bearer ${Keychain.get(K_TOKEN)}`,
    "Accept": "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  req.timeoutInterval = 15;
  const txt = await req.loadString();
  const code = req.response && req.response.statusCode;
  if (code === 401) throw new Error("Jeton GitHub refusé ou expiré.");
  if (code === 404) throw new Error("status.json introuvable (premier envoi pas encore fait).");
  if (code && code >= 400) throw new Error(`Erreur GitHub ${code}.`);
  return JSON.parse(txt);
}

// ---------- Mise en forme ----------
const euro = n => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function heure(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const f = new DateFormatter();
  const auj = new Date();
  f.dateFormat = d.toDateString() === auj.toDateString() ? "HH'h'mm" : "dd/MM HH'h'mm";
  return f.string(d);
}

function txt(stack, s, taille, couleur, gras) {
  const t = stack.addText(String(s));
  t.font = gras ? Font.boldSystemFont(taille) : Font.systemFont(taille);
  t.textColor = couleur;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function ligneChiffre(stack, label, valeur, couleur) {
  const l = stack.addStack();
  l.layoutHorizontally();
  txt(l, label, 11, C.doux, false);
  l.addSpacer();
  txt(l, valeur, 12, couleur || C.texte, true);
}

function construire(s) {
  const w = new ListWidget();
  w.backgroundColor = C.fond;
  w.setPadding(12, 14, 12, 14);
  w.url = TABLEAU_DE_BORD;

  // En-tête
  const tete = w.addStack();
  tete.layoutHorizontally();
  txt(tete, "Conseil des Unités", 12, C.texte, true);
  tete.addSpacer();
  const vieux = (Date.now() - new Date(s.maj)) / 60000 > 90;
  txt(tete, (vieux ? "⚠ " : "") + heure(s.maj), 11, vieux ? C.orange : C.doux, false);

  w.addSpacer(6);

  // Corps : bénéfice net à gauche, détail à droite
  const corps = w.addStack();
  corps.layoutHorizontally();

  const g = corps.addStack();
  g.layoutVertically();
  txt(g, "BÉNÉFICE NET", 9, C.doux, false);
  const net = Number(s.net) || 0;
  txt(g, euro(net), 26, net > 0 ? C.vert : net < 0 ? C.rouge : C.texte, true);
  const u = (s.unites && s.unites[0]) || null;
  if (u) txt(g, `${u.nom} · ${u.phase} J${u.jour}/${u.jour_max}`, 10, C.doux, false);

  corps.addSpacer(14);

  const d = corps.addStack();
  d.layoutVertically();
  d.size = new Size(120, 0);
  ligneChiffre(d, "Encaissé", euro(s.encaisse));
  d.addSpacer(3);
  ligneChiffre(d, "Coûts", euro(s.couts));
  d.addSpacer(3);
  ligneChiffre(d, "Unités actives", String(s.unites_actives ?? 0));

  w.addSpacer();

  // Pied : ce qui attend Clément
  const pied = w.addStack();
  pied.layoutHorizontally();
  pied.centerAlignContent();
  const n = Number(s.demandes_en_attente) || 0;
  if (n > 0) {
    txt(pied, `● ${n} demande${n > 1 ? "s" : ""} pour toi`, 11, C.orange, true);
    if (s.alerte) { pied.addSpacer(6); txt(pied, s.alerte, 10, C.doux, false); }
  } else {
    txt(pied, "● Rien à faire pour toi", 11, C.vert, true);
  }

  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

function erreur(msg) {
  const w = new ListWidget();
  w.backgroundColor = C.fond;
  w.setPadding(12, 14, 12, 14);
  w.url = TABLEAU_DE_BORD;
  txt(w, "Conseil des Unités", 12, C.texte, true);
  w.addSpacer(6);
  const t = w.addText(msg);
  t.font = Font.systemFont(11);
  t.textColor = C.orange;
  w.addSpacer();
  txt(w, "Touchez pour ouvrir le tableau de bord", 10, C.doux, false);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

// ---------- Exécution ----------
async function main() {
  if (config.runsInApp) {
    const choix = new Alert();
    choix.title = "Widget Conseil des Unités";
    choix.addAction("Aperçu");
    choix.addAction("Reconfigurer (nom / jeton)");
    choix.addCancelAction("Fermer");
    const c = await choix.presentAlert();
    if (c === -1) return;
    await configurer(c === 1);
  }

  let widget;
  try {
    widget = construire(await lireStatut());
  } catch (e) {
    widget = erreur(e.message);
  }

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
}

await main();
Script.complete();
