// Email templates of the Booking Radar (Greg's wording), ported verbatim from
// the claude.ai artifact. Plain JS on purpose: the text must not drift.
/* eslint-disable */

function fmtD(d){ if(!d) return ""; const x=new Date(d.slice(0,10)); if(isNaN(x)) return d; return x.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"2-digit"}); }

/* ---------- Emails : modèles de Greg ---------- */
const K={
  epk:"https://kruzberg.com/wp-content/uploads/2026/05/KRUZBERG_EPK_2026.pdf",
  epkEn:"https://kruzberg.com/wp-content/uploads/2026/05/KRUZBERG_EPK_2026_EN.pdf",
  live:"https://youtu.be/PIi2OHkTvxw", done:"https://youtu.be/9FpWn3T5hnA", one:"https://youtu.be/OcihZpw6CjM",
  site:"kruzberg.com", insta:"instagram.com/kruzberg_noise", listen:"music.imusician.pro/a/vmQMhGso"
};
const KINDS={festival:"Festival",tremplin:"Tremplin / concours",venue:"Salle / bar (date)",support:"Première partie",booker:"Agence de booking",label:"Label",promoteur:"Promoteur / collectif",presse:"Presse / webzine",radio:"Radio"};
const FRANCO=/genève|geneve|lausanne|fribourg|neuchâtel|neuchatel|sion|delémont|bienne|bruxelles|brussels|liège|liege|namur|charleroi|mons|tournai|louvain-la-neuve|luxembourg|esch|montréal|montreal|québec|quebec/i;
function langOf(l){ const c=(l.country||"FR").toUpperCase(); if(c==="FR") return "fr"; if(["CH","BE","LU","CA"].includes(c)&&FRANCO.test(l.city||"")) return "fr"; return "en"; }
function kindOf(l){
  const t=(l.type||"").toLowerCase();
  switch(l.cat){
    case "festivals": return "festival";
    case "tremplins": return "tremplin";
    case "booking_fr": case "booking_eu": return /collectif|promoteur/.test(t)?"promoteur":"venue";
    case "support": return "support";
    case "pros": return /label/.test(t)?"label":/book|tourn|agen/.test(t)?"booker":"promoteur";
    case "presse": return /radio/.test(t)?"radio":"presse";
  }
  return "venue";
}
function emailsOf(s){ return [...new Set((String(s||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase()))]; }
function firstNames(contact){
  const c=String(contact||"").split(/\s+[—–-]\s+/)[0].trim();
  if(!c||c.length>60||/[@–—()\/:;]|http|programm|accueil|équipe|team|rédaction|redaction|contact|booking|info/i.test(c)) return [];
  const people=c.split(/\s*(?:,|&|\bet\b|\band\b)\s*/i).filter(Boolean);
  const out=[];
  for(const p of people){ const w=p.trim().split(/\s+/)[0]; if(/^[A-ZÀ-Ý][a-zà-ÿ'-]{1,}$/.test(w)) out.push(w); else return []; }
  return out.slice(0,3);
}
function greet(l,lang){
  const n=firstNames(l.contact);
  if(lang==="en") return n.length?`Hi ${n.join(", hi ")},`:"Hi,";
  return n.length?`Bonjour ${n.join(", bonjour ")},`:"Bonjour,";
}
function auNom(name){ // "au Brin de Zinc", "à la Bobine", "à l'Ampérage", "aux Abattoirs"
  const n=String(name||"").replace(/\s*\([^)]*\)\s*/g," ").trim();
  let m;
  if((m=n.match(/^Le\s+(.*)/))) return "au "+m[1];
  if((m=n.match(/^Les\s+(.*)/))) return "aux "+m[1];
  if((m=n.match(/^La\s+(.*)/))) return "à la "+m[1];
  if((m=n.match(/^L['’]\s*(.*)/))) return "à l'"+m[1];
  return "à "+n;
}
function yearOf(l){
  const s=[l.deadline,l.eventDate].filter(Boolean).join(" ");
  const ys=(s.match(/20\d\d/g)||[]).map(Number).filter(y=>y>=new Date().getFullYear());
  if(ys.length) return Math.max(...ys);
  const d=new Date(); return d.getMonth()>=7?d.getFullYear()+1:d.getFullYear();
}
function dateFR(d){ if(!/^\d{4}-\d{2}-\d{2}/.test(d||"")) return d||""; return new Date(d.slice(0,10)).toLocaleDateString("fr-FR",{day:"numeric",month:"long"}); }
function dateEN(d){ if(!/^\d{4}-\d{2}-\d{2}/.test(d||"")) return d||""; return new Date(d.slice(0,10)).toLocaleDateString("en-GB",{day:"numeric",month:"long"}); }

function presentFR(intro){ return `${intro} au sujet de notre groupe KRUZBERG (dossier de presse : ${K.epk}) :

• Style : Post-Punk
• Localisation : Lyon
• Influences : Fontaines D.C., Idles, Shame
• Structure accompagnement pro : Le Labo du Conservatoire (Lyon)

Notre dernière live session : ${K.live}

Quelques démos supplémentaires :
• Done Trying : ${K.done}
• 1, 2, 3, 4 ! : ${K.one}

Écoute et informations : ${K.site} / ${K.insta} / ${K.listen}`; }
function presentEN(){ return `I'm reaching out about our band KRUZBERG (EPK: ${K.epkEn}):

• Style: Post-Punk
• Based in: Lyon, France
• Influences: Fontaines D.C., Idles, Shame
• Professional development support: Le Labo du Conservatoire (Lyon)

Our latest live session: ${K.live}

A few more demos:
• Done Trying: ${K.done}
• 1, 2, 3, 4 !: ${K.one}

Listen & info: ${K.site} / ${K.insta} / ${K.listen}`; }
const SIG_FR=`Merci d'avance pour votre retour et à bientôt,
Cordialement,
Greg

Grégoire Paillas — KRUZBERG
booking@kruzberg.com · 07 60 08 64 13
AV117 Production · The Blend Corp`;
const SIG_EN=`Thanks in advance, hope to hear from you soon.
Best,
Greg

Grégoire Paillas — KRUZBERG
booking@kruzberg.com · +33 7 60 08 64 13
AV117 Production · The Blend Corp`;

function buildMail(l,kind,lang){
  const N=l.name, Y=yearOf(l), fr=lang!=="en";
  const V=l.venue||N;
  let subj, ask, intro="Je me permets de vous contacter";
  if(fr){
    switch(kind){
      case "festival": subj="Programmation - Kruzberg - Post-Punk";
        ask=`On aimerait beaucoup défendre notre musique sur la scène de ${N} pour l'édition ${Y}.

Est-ce que la programmation est encore ouverte ? Passez-vous par un appel à candidatures ou par contact direct, et à quelle période traitez-vous les propositions ?`; break;
      case "tremplin": subj=`Candidature ${N} - Kruzberg - Post-Punk`;
        ask=`On aimerait beaucoup candidater à ${N} pour l'édition ${Y}.

Est-ce que les candidatures sont ouvertes ? Quelles sont les modalités et la date limite ?`; break;
      case "venue": subj="Programmation - Kruzberg - Post-Punk";
        ask=`On aimerait beaucoup venir jouer ${auNom(N)} un de ces quatre, est-ce que vous auriez une date à nous proposer ? Si oui, à quel moment ?

Comment procédez-vous habituellement ?`; break;
      case "support": subj=`Première partie ${N}${l.eventDate?" "+fmtD(l.eventDate):""} - Kruzberg - Post-Punk`;
        ask=`J'ai vu que ${N} joue ${auNom(V)} le ${dateFR(l.eventDate)}, et on aimerait beaucoup assurer la première partie.

Est-ce que le créneau est encore ouvert ? Si c'est le tourneur du groupe qui gère, pourriez-vous m'indiquer le bon contact ?`; break;
      case "booker": subj="Booking - Kruzberg - Post-Punk";
        ask=`Nous travaillons actuellement sur un EP pour 2027 et en parallèle on aimerait beaucoup travailler avec une agence de booking plutôt que de tout gérer en interne.
Actuellement en développement et en forte croissance, nous avons de grosses ambitions de tournées.

Est-ce que votre roster est ouvert en ce moment ? Et comment travaillez-vous habituellement avec un groupe à notre stade ?`; break;
      case "label": subj="Démo - Kruzberg - Post-Punk";
        ask=`Nous travaillons actuellement sur un EP pour 2027 et on cherche un label pour nous accompagner sur cette sortie.

Est-ce que vous écoutez des démos en ce moment ? Et comment travaillez-vous habituellement avec un groupe à notre stade ?`; break;
      case "promoteur": subj="Programmation - Kruzberg - Post-Punk";
        ask=`On aimerait beaucoup jouer sur une de vos soirées, est-ce que vous auriez une date à nous proposer ? Si oui, à quel moment ?

Comment procédez-vous habituellement ?`; break;
      case "presse": subj="Presse - Kruzberg - Post-Punk";
        ask=`Notre dernier single, Two½ Hotel Stars, est sorti le 17 juillet 2026 et clôt notre triptyque (après BlackMud Manor et Where I Belong) : ${K.listen}

On serait ravis que vous puissiez l'écouter et, pourquoi pas, en parler dans ${N}. Je peux vous envoyer les visuels, la bio et les fichiers si besoin.`; break;
      case "radio": subj="Proposition radio - Kruzberg - Post-Punk";
        ask=`Notre dernier single, Two½ Hotel Stars, est sorti le 17 juillet 2026 et clôt notre triptyque (après BlackMud Manor et Where I Belong) : ${K.listen}

On serait ravis qu'il puisse passer sur ${N}. Je peux vous envoyer le WAV, la bio et les visuels si besoin. Est-ce que vous passez par une adresse ou une émission en particulier pour les groupes locaux ?`; break;
    }
    return {subject:subj, body:`${greet(l,"fr")}
J'espère que vous allez bien.

${presentFR(intro)}

${ask}

${SIG_FR}`};
  }
  switch(kind){
    case "festival": subj="Booking - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`We'd love to bring our music to ${N} for the ${Y} edition.

Is the line-up still open? Do you work with an open call or direct contact, and when do you usually review proposals?`; break;
    case "tremplin": subj=`Application ${N} - Kruzberg - Post-Punk`;
      ask=`We'd love to apply to ${N} for the ${Y} edition.

Are applications open to bands based in France? What are the terms and the deadline?`; break;
    case "venue": subj="Booking - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`We'd love to come and play at ${N}. Would you have a slot for us? If so, around when? We'd be happy to share the bill with a local band.

How do you usually work with bands from abroad?`; break;
    case "support": subj=`Support ${N}${l.eventDate?" "+dateEN(l.eventDate):""} - Kruzberg - Post-Punk`;
      ask=`I saw that ${N} is playing ${V} on ${dateEN(l.eventDate)}, and we'd love to open the show.

Is the support slot still open? If it's handled by the band's agent, could you point me to the right contact?`; break;
    case "booker": subj="Booking - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`We're currently working on an EP for 2027, and we'd love to work with a booking agency rather than handle everything ourselves.
We're a developing band, growing fast, with big touring ambitions.

Is your roster open at the moment? And how do you usually work with a band at our stage?`; break;
    case "label": subj="Demo - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`We're currently working on an EP for 2027 and we're looking for a label to release it.

Are you listening to demos at the moment? And how do you usually work with a band at our stage?`; break;
    case "promoteur": subj="Booking - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`We'd love to play one of your nights. Would you have a date for us? If so, around when?

How do you usually work with bands from abroad?`; break;
    case "presse": subj="Press - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`Our latest single, Two½ Hotel Stars, came out on July 17, 2026, completing our triptych (after BlackMud Manor and Where I Belong): ${K.listen}

We'd be really happy if you could give it a listen and maybe feature it on ${N}. I can send artwork, bio and files if needed.`; break;
    case "radio": subj="Radio submission - Kruzberg - Post-Punk (Lyon, FR)";
      ask=`Our latest single, Two½ Hotel Stars, came out on July 17, 2026, completing our triptych (after BlackMud Manor and Where I Belong): ${K.listen}

We'd be really happy if it could get some airplay on ${N}. I can send the WAV, bio and artwork if needed.`; break;
  }
  return {subject:subj, body:`${greet(l,"en")}
I hope you're doing well.

${presentEN()}

${ask}

${SIG_EN}`};
}

function mailtoOf(d){ return `mailto:${emailsOf(d.to).join(",")}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`; }

export { K, KINDS, langOf, kindOf, emailsOf, buildMail, mailtoOf, fmtD };
