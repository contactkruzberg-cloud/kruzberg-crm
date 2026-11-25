import type { Band, DiscoverAngle, Watch } from './types';

// Les consignes de recherche. Elles tiennent le contexte de KRUZBERG pour que
// la recherche sache ce qui nous est utile (et ce qui ne l'est pas).

export const KRUZBERG = `KRUZBERG est un quatuor post-punk / cold wave de Lyon (France) : chant scandé en anglais, envolées mélodiques, son brut, un groupe qui emmène le public en transe. Références : Fontaines D.C., IDLES, la nouvelle vague post-punk irlandaise et britannique. Groupe émergent : on vise des lieux de 50 à 400 places, des bars-concerts, des clubs associatifs, des petits festivals DIY, d'abord à Lyon et en Auvergne-Rhône-Alpes, puis en France et en Europe (une tournée européenne est prévue en mai 2027). Notre règle : si on voit le nom d'un même tourneur écrit plusieurs fois chez les groupes de notre niche, c'est qu'il y a quelque chose à faire avec lui.`;

const RULES = `Règles :
- Ne relève QUE ce que tu as trouvé dans une source consultée. Chaque fait a son URL de source (page du groupe, du label, du tourneur, Songkick, Bandsintown, setlist.fm, Discogs, Bandcamp, Instagram, article de presse, affiche de festival, Wikipédia…). Jamais d'invention, jamais de nom deviné.
- Ne relève pas l'autoproduction (« sans label », « DIY ») ni le groupe lui-même comme organisateur : si personne n'est nommé, n'ajoute rien. Un studio d'enregistrement n'est pas une salle.
- Écris les noms tels qu'ils s'écrivent officiellement (ex. « Howlin' Banana Records », « Le Périscope »).
- Réponds en français pour les textes libres.`;

const KINDS = ['tourneur', 'manager', 'label', 'salle', 'festival', 'organisateur', 'tete_affiche', 'plateau', 'media', 'dispositif'] as const;
const STAGES = [
  'formation',
  'premier_concert',
  'premiere_sortie',
  'premier_album',
  'tremplin',
  'accompagnement',
  'residence',
  'premiere_partie',
  'festival',
  'premier_tourneur',
  'signature_label',
  'tournee_france',
  'tournee_europe',
  'media',
  'session_live',
  'autre',
] as const;

const MANAGER_HOW = `la personne ou la société qui manage le groupe (name = la société de management si elle existe, sinon le nom de la personne ; detail = « manager de X », la personne de contact, le territoire et la période si connus ; website = site de la société). Où le trouver : rubrique « contact » / « management » du site et du Linktree, bio Instagram et Facebook, page Bandcamp, dossier de presse (EPK), page artiste du label ou du tourneur, fiches IRMA / annuaires pros, articles et interviews (« managé par », « management : », « mgmt »). Relève aussi les anciens managers. Un tourneur n'est pas un manager : ne le relève ici que s'il est explicitement présenté comme manager.`;

export const BAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['band', 'findings', 'milestones'],
  properties: {
    band: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'lesson'],
      properties: {
        city: { type: 'string' },
        country: { type: 'string', description: 'Pays en français.' },
        genre: { type: 'string' },
        formedYear: { type: 'integer' },
        website: { type: 'string' },
        bandcamp: { type: 'string' },
        instagram: { type: 'string' },
        summary: { type: 'string', description: 'Le parcours en 4 à 6 phrases : débuts, sorties, tourneur, tremplins, dates marquantes.' },
        lesson: { type: 'string', description: 'Ce que ce parcours apprend à KRUZBERG, concrètement : quelles portes ont compté, dans quel ordre (2 à 4 phrases).' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'name', 'sourceUrl'],
        properties: {
          kind: { type: 'string', enum: KINDS },
          name: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string', description: 'Pays en français.' },
          when: { type: 'string', description: 'YYYY ou YYYY-MM-DD.' },
          detail: { type: 'string', description: 'Contexte court : « album X (2025) », « 1re partie de Y », « lauréat 2023 », « territoire France »…' },
          capacity: { type: 'integer', description: 'Jauge approximative si salle connue.' },
          scale: { type: 'string', enum: ['local', 'national', 'international'] },
          website: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
      },
    },
    milestones: {
      type: 'array',
      description: 'Trajectoire datée, dans l’ordre chronologique.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['year', 'stage', 'title', 'sourceUrl'],
        properties: {
          year: { type: 'integer' },
          when: { type: 'string', description: 'YYYY-MM ou YYYY-MM-DD si connu.' },
          stage: { type: 'string', enum: STAGES },
          title: { type: 'string', description: 'Ce qui s’est passé, en une phrase courte.' },
          actor: { type: 'string', description: 'Nom de l’acteur en jeu (tremplin, tourneur, label, salle, festival, média, groupe…).' },
          actorKind: { type: 'string', enum: KINDS },
          sourceUrl: { type: 'string' },
        },
      },
    },
  },
} as const;

export function bandPrompt(b: Band): string {
  const where = [b.city, b.country].filter(Boolean).join(', ');
  const ref = b.reference
    ? `\n\nCe groupe est un GROUPE À SUCCÈS dont on veut comprendre le parcours pour en tirer des leçons. Concentre-toi sur ses DÉBUTS (les 5 à 6 premières années) : premières salles, premières premières parties, tremplins et dispositifs d'accompagnement, rencontre avec le premier tourneur et le premier label, premiers médias qui en ont parlé, premières tournées hors de sa ville, ce qui a fait basculer sa carrière. Les grandes salles d'après le succès nous intéressent peu.`
    : '';
  return `${KRUZBERG}

Tâche : relever le parcours du groupe « ${b.name} »${where ? ` (${where})` : ''}${b.why ? ` — note : ${b.why}` : ''}. C'est une étape de « la constellation » : on cartographie les acteurs qui reviennent chez les groupes de notre niche, et les étapes qui ont fait réussir les groupes qui ont percé.${ref}

Assure-toi d'abord que c'est le bon groupe (post-punk / cold wave / garage / rock indé). S'il y a des homonymes, garde celui de cette scène.

A. Faits (« findings ») — relève, avec le plus de détails possible :
1. tourneur / agence de booking (par territoire si plusieurs : France, Europe, UK…) → kind "tourneur", avec scale et website. C'est le fait le plus important et le plus caché : cherche-le activement. Où le trouver : la page contact / « booking » du site du groupe, la bio Instagram ou le Linktree, la page Bandcamp, la page artiste du label ; et surtout, pour les dates en France, les pages de billetterie et d'agenda des salles (Fnac Spectacles, Ticketmaster, Shotgun, Dice, site de la salle) qui indiquent « X présente », « production : X », « en accord avec Y ». Pour l'étranger : « booking agent », « by arrangement with », « agency ». Relève aussi les anciens tourneurs ;
2. label(s) et sorties → kind "label" (detail = titre et année) ;
3. salles où il a joué → kind "salle" (city, country, when, capacity si connue). Cherche sur Songkick, Bandsintown, setlist.fm, le site, l'Instagram, les agendas. Privilégie les petites et moyennes salles et les dates en France, Belgique, Suisse ; relève aussi les dates À VENIR (fin 2026, 2027) avec leur date exacte ; jusqu'à 40 salles ;
4. festivals → kind "festival" (when) ;
5. collectifs / assos / promoteurs qui ont organisé leurs dates → kind "organisateur" ;
6. groupes dont il a fait la 1re partie → kind "tete_affiche" (name = le groupe en tête d'affiche, detail = lieu) ;
7. groupes croisés en co-plateau → kind "plateau" ;
8. médias, webzines, radios, blogs, émissions et sessions live qui l'ont chroniqué, interviewé ou passé (KEXP, BBC 6 Music, Les Inrocks, Rock&Folk, New Noise, Gonzaï, Mowno, Section 26, Le Petit Bulletin, radios associatives…) → kind "media" (detail = type de mention) ;
9. tremplins, concours, dispositifs d'accompagnement, résidences, aides (iNOUïS du Printemps de Bourges, Ninkasi Musik Lab, FAIR, Ricard Live, Buzz Booster, Les Inouïs régionaux, SMAC qui accompagnent, résidences de création…) → kind "dispositif" (detail = « lauréat », « sélectionné », « finaliste », année) ;
10. manager / management → kind "manager" : ${MANAGER_HOW}

Vise 40 à 80 faits.

B. Trajectoire (« milestones ») — l'histoire datée du groupe, de sa formation à aujourd'hui, en 10 à 25 étapes, avec l'année (et le mois si connu) : formation, premier concert, première sortie, premier album, tremplins, accompagnement, résidences, premières parties marquantes, festivals marquants, premier tourneur, signature label, premières tournées France puis Europe/UK, médias décisifs, sessions live. Indique pour chaque étape l'acteur en jeu quand il y en a un. Donne aussi l'année de formation (formedYear).

${RULES}`;
}

export const DISCOVER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bands'],
  properties: {
    bands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'fit', 'sourceUrl'],
        properties: {
          name: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string', description: 'Pays en français.' },
          genre: { type: 'string' },
          why: { type: 'string', description: 'Pourquoi KRUZBERG peut s’y identifier et ce qu’il a déjà fait (1 à 2 phrases).' },
          fit: { type: 'integer', minimum: 1, maximum: 5, description: '5 = esthétique et stade très proches de KRUZBERG ; 3 = voisin ; 1 = lointain.' },
          sourceUrl: { type: 'string' },
        },
      },
    },
  },
} as const;

const ANGLES: Record<DiscoverAngle, string> = {
  lyon_scene: `Trouve les groupes de Lyon et de sa métropole (Villeurbanne, Vaulx-en-Velin…) de notre esthétique : post-punk, cold wave, noise rock, garage, rock indé tendu, shoegaze sombre. Cherche dans les webzines et médias locaux (Le Petit Bulletin, Lyon Capitale, Bastringue, Ville Morte, Radio Canut, Radio Pluriel, LyonBondyBlog, Mowno…), les labels et collectifs lyonnais, les Bandcamp tagués « lyon » + « post-punk » / « cold wave » / « garage » / « noise ».`,
  lyon_agendas: `Épluche les programmations 2024-2026 des lieux lyonnais qui accueillent notre scène : Le Sonic, Le Farmer, Grrrnd Zero, Kraspek Myzik, Le Périscope, Le Marché Gare, Club du Transbordeur, Ninkasi Kao et Ninkasi Gerland, Groom, Rock'n Eat, Le Trokson, La Marquise, Le Petit Salon, Épicerie Moderne (Feyzin), Le Jack Jack (Bron), et les bars-concerts de la Croix-Rousse et de la Guillotière. Relève les groupes LOCAUX (Lyon et région) programmés dans ces lieux, en premières parties ou en plateaux, qui jouent dans notre esthétique.`,
  aura_dispositifs: `Trouve les groupes d'Auvergne-Rhône-Alpes de notre esthétique (ou proches : rock, garage, punk, indé) passés par des tremplins et dispositifs de la région ces dernières années : iNOUïS du Printemps de Bourges (sélections régionales Auvergne-Rhône-Alpes), Ninkasi Musik Lab, accompagnements du Périscope, du Marché Gare, de la Tannerie (Bourg-en-Bresse), du Fil (Saint-Étienne), de la Belle Électrique et de la Source (Grenoble), de la Coopérative de Mai (Clermont-Ferrand), du Brise Glace (Annecy), du Ninkasi, du Transbordeur, tremplin Woodstower, le réseau régional des musiques actuelles, les tremplins des SMAC et des festivals de la région… Pour chaque groupe, dis dans « why » par quel dispositif il est passé et quand.`,
  france_niche: `Trouve les groupes français émergents ou en développement (2020-2026) de la niche post-punk / cold wave / noise / garage sombre, à un stade proche du nôtre ou quelques années devant : premier ou deuxième album, tourneur indépendant, dates en France et en Europe. Sources : Mowno, New Noise, Gonzaï, Section 26, Rock&Folk, Les Inrocks (« les groupes à suivre »), labels comme Howlin' Banana, Vicious Circle, Born Bad, Teenage Menopause, Kythibong ; programmations des festivals Rock en Seine (scènes découvertes), Les Transmusicales, La Route du Rock, Binic Folks Blues, Foul Weather, Pete the Monkey, Levitation France.`,
  europe_niche: `Trouve les groupes européens émergents (Irlande, Royaume-Uni, Belgique, Pays-Bas, Suisse, Allemagne, Scandinavie, Espagne, Italie, Europe de l'Est) de la nouvelle vague post-punk / cold wave / noise, au stade de petites salles et de premières tournées européennes (2022-2026) : ceux qui jouent dans des clubs de 100 à 400 places, signent chez de petits labels, font les premières parties des groupes établis. Sources : The Quietus, Loud and Quiet, So Young Magazine, Dork, Clash, KEXP, programmations de Left of the Dial, Eurosonic, Reeperbahn, The Great Escape, Iceland Airwaves, Sonic City.`,
};

export function discoverPrompt(angle: DiscoverAngle, known: string[]): string {
  return `${KRUZBERG}

Tâche : trouver des groupes auxquels KRUZBERG peut s'identifier, pour cartographier les lieux, tourneurs, tremplins et médias qui leur sont accessibles (l'« espionnage industriel » : leur parcours est une carte des lieux et des contacts accessibles pour nous).

Angle de cette recherche : ${ANGLES[angle]}

Garde les groupes actifs (une date ou une sortie en 2024-2026). Écarte les projets solo électro, le metal pur, le hip-hop, la chanson française. Note chaque groupe de 1 à 5 selon sa proximité avec KRUZBERG (esthétique ET stade de carrière).

Déjà dans la liste, ne pas reproposer : ${known.join(', ')}.

Fais de nombreuses recherches et propose 15 à 30 groupes.

${RULES}`;
}

export function rosterPrompt(w: Pick<Watch, 'name' | 'kind' | 'city'> & { note?: string }, known: string[]): string {
  return `${KRUZBERG}

Tâche : explorer le catalogue (roster) de « ${w.name} »${w.city ? ` (${w.city})` : ''}, ${w.kind === 'label' ? 'label' : 'tourneur / agence de booking'}${w.note ? ` — note : ${w.note}` : ''}. Vérifie d'abord le nom exact et le site officiel.

Relève les groupes de ce catalogue qui sont dans notre niche ou juste à côté (post-punk, cold wave, noise, garage, indé sombre), en priorité ceux qui sont à un stade proche du nôtre. Pour chacun, dis en une phrase pourquoi il est proche de KRUZBERG et note sa proximité de 1 à 5.

Déjà dans la liste, ne pas reproposer : ${known.join(', ')}.

Propose jusqu'à 15 groupes. S'il n'y en a aucun de notre niche, renvoie une liste vide.

${RULES}`;
}

export const SYNTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'patterns', 'roadmap'],
  properties: {
    summary: { type: 'string', description: 'Ce que racontent ces parcours, en 4 à 6 phrases.' },
    patterns: {
      type: 'array',
      description: '5 à 10 patterns de réussite.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'evidence', 'bands', 'actors', 'forKruzberg'],
        properties: {
          title: { type: 'string' },
          evidence: { type: 'string', description: 'Les faits datés qui le montrent, groupe par groupe.' },
          bands: { type: 'array', items: { type: 'string' } },
          actors: { type: 'array', items: { type: 'string' }, description: 'Acteurs concrets en jeu (tremplins, tourneurs, labels, salles, médias).' },
          forKruzberg: { type: 'string', description: 'Ce que KRUZBERG doit en faire, concrètement.' },
        },
      },
    },
    roadmap: {
      type: 'array',
      description: '4 à 8 étapes, dans l’ordre.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'horizon', 'actions', 'actors'],
        properties: {
          step: { type: 'string' },
          horizon: { type: 'string', description: 'Ex. « d’ici fin 2026 », « printemps 2027 ».' },
          actions: { type: 'string' },
          actors: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

export function synthesisPrompt(dossier: string): string {
  return `${KRUZBERG}

Où en est KRUZBERG (octobre 2026) : groupe lyonnais accompagné ; une live session filmée ; une date à venir au Marché Gare et une résidence ; une tournée européenne prévue en mai 2027 ; une actualité à trancher (single début 2027 ou EP en septembre 2027) ; candidatures prévues aux iNOUïS 2027 (clôture le 12 novembre 2026) et au Ninkasi Musik Lab ; priorité : consolider le local avant de s'étendre (routing envisagé : Lyon → Besançon → Strasbourg → Bruxelles → Lille).

Voici le dossier de la constellation : les trajectoires datées de groupes à succès (Last Train, Johnny Mafia, Johnnie Carwash, Fontaines D.C., IDLES, shame, The Murder Capital, DITZ, Gurriers, Enola Gay…) et de groupes de notre niche, avec les acteurs (tourneurs, labels, tremplins, salles, médias) qui reviennent le plus.

${dossier}

Tâche : identifie les PATTERNS DE SUCCÈS. Compare les débuts : combien d'années entre la formation et le premier tourneur, le premier label, la première tournée hors de la ville ; par quels tremplins, salles, festivals, premières parties et médias ils sont passés ; ce qui a fait basculer chaque carrière ; ce qui est commun aux groupes français (Last Train, Johnny Mafia, Johnnie Carwash) d'un côté, aux groupes irlandais et britanniques de l'autre. Cite des faits datés du dossier, pas des généralités. Puis propose une feuille de route concrète pour KRUZBERG, avec les acteurs précis du dossier à approcher.

Réponds en français.`;
}

/** Managers only: a light search for groups already explored before managers were tracked. */
export const MANAGERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      description: 'Managers et sociétés de management du groupe (vide si aucun n’est trouvé dans une source).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'sourceUrl'],
        properties: {
          name: { type: 'string', description: 'Société de management, sinon nom de la personne.' },
          detail: { type: 'string', description: '« manager de X », personne de contact, territoire, période.' },
          city: { type: 'string' },
          country: { type: 'string', description: 'Pays en français.' },
          when: { type: 'string', description: 'YYYY si connu.' },
          scale: { type: 'string', enum: ['local', 'national', 'international'] },
          website: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
      },
    },
  },
} as const;

export function managersPrompt(b: Band): string {
  const where = [b.city, b.country].filter(Boolean).join(', ');
  const site = b.links?.website || b.links?.bandcamp || b.links?.instagram;
  return `${KRUZBERG}

Tâche : trouver le ou les managers du groupe « ${b.name} »${where ? ` (${where})` : ''}${site ? ` — en ligne : ${site}` : ''}. Assure-toi que c'est le bon groupe (post-punk / cold wave / garage / rock indé).

Relève ${MANAGER_HOW}

S'il n'y a aucun manager nommé dans une source, rends une liste vide : ne devine jamais.

${RULES}`;
}

// ---------------------------------------------------------------- question libre

export const ASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'sources', 'bands', 'facts'],
  properties: {
    answer: {
      type: 'string',
      description:
        'La réponse à la question, en français, directe et utile pour KRUZBERG : 5 à 25 lignes, listes à puces bienvenues (« - »), noms exacts, dates, et ce qu’on peut en faire concrètement. Dis clairement ce que tu n’as pas trouvé.',
    },
    sources: {
      type: 'array',
      description: 'Les pages consultées qui appuient la réponse (5 à 15).',
      items: { type: 'object', additionalProperties: false, required: ['title', 'url'], properties: { title: { type: 'string' }, url: { type: 'string' } } },
    },
    bands: {
      type: 'array',
      description: 'Groupes pertinents pour la question, à ajouter à la constellation (vide si la question ne porte pas sur des groupes).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'fit', 'sourceUrl'],
        properties: {
          name: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string', description: 'Pays en français.' },
          genre: { type: 'string' },
          why: { type: 'string', description: 'Le lien avec la question et avec KRUZBERG (1 à 2 phrases).' },
          fit: { type: 'integer', minimum: 1, maximum: 5 },
          sourceUrl: { type: 'string' },
        },
      },
    },
    facts: {
      type: 'array',
      description: 'Liens sourcés entre un groupe et un acteur (tourneur, label, salle, festival, manager…), à ajouter au réseau. Le groupe peut être déjà connu ou listé dans bands.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['band', 'kind', 'name', 'sourceUrl'],
        properties: {
          band: { type: 'string', description: 'Nom du groupe.' },
          kind: { type: 'string', enum: [...KINDS] },
          name: { type: 'string', description: 'Nom de l’acteur.' },
          city: { type: 'string' },
          country: { type: 'string' },
          when: { type: 'string', description: 'AAAA ou AAAA-MM.' },
          detail: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
      },
    },
  },
} as const;

export function askPrompt(question: string, context: string): string {
  return `${KRUZBERG}

Greg (le booker du groupe) te pose une question depuis la Constellation, la carte du réseau de notre niche (groupes proches, leurs tourneurs, labels, salles, festivals, managers, médias).

Question : « ${question} »

Ce que la constellation contient déjà (pour ne pas répéter et pour relier ta réponse) :
${context}

Fais les recherches nécessaires sur le web, puis réponds à la question. Si elle porte sur un groupe, un label, un tourneur, un festival ou une scène précise, va chercher les faits datés et sourcés. Ajoute dans « bands » les groupes nouveaux pertinents et dans « facts » chaque lien groupe → acteur que tu as vérifié, pour enrichir la carte.

${RULES}`;
}
