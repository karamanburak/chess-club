import type { Lang } from "./i18n";
/** Famous words about the game. One is shown per calendar day, everywhere the club speaks for itself. */
export interface Quote {
  text: string;
  /** German rendering of the quote. */
  de: string;
  by: string;
  /** German author label, only for anonymous sources ("Indian proverb"). */
  byDe?: string;
}

export const QUOTES: readonly Quote[] = [
  { text: "Chess is the gymnasium of the mind.", de: "Schach ist die Turnhalle des Geistes.", by: "Blaise Pascal" },
  { text: "Every chess master was once a beginner.", de: "Jeder Schachmeister war einmal ein Anfänger.", by: "Irving Chernev" },
  { text: "When you see a good move, look for a better one.", de: "Wenn du einen guten Zug siehst, suche nach einem besseren.", by: "Emanuel Lasker" },
  { text: "Tactics is knowing what to do when there is something to do; strategy is knowing what to do when there is nothing to do.", de: "Taktik ist zu wissen, was zu tun ist, wenn es etwas zu tun gibt; Strategie ist zu wissen, was zu tun ist, wenn es nichts zu tun gibt.", by: "Savielly Tartakower" },
  { text: "The blunders are all there on the board, waiting to be made.", de: "Die Fehler liegen alle auf dem Brett und warten darauf, gemacht zu werden.", by: "Savielly Tartakower" },
  { text: "Chess is life in miniature. Chess is a struggle, chess is battles.", de: "Schach ist das Leben im Kleinen. Schach ist Kampf, Schach ist Schlacht.", by: "Garry Kasparov" },
  { text: "I don't believe in psychology. I believe in good moves.", de: "Ich glaube nicht an Psychologie. Ich glaube an gute Züge.", by: "Bobby Fischer" },
  { text: "The pin is mightier than the sword.", de: "Die Fesselung ist mächtiger als das Schwert.", by: "Fred Reinfeld" },
  { text: "Chess is the struggle against the error.", de: "Schach ist der Kampf gegen den Fehler.", by: "Johannes Zukertort" },
  { text: "You may learn much more from a game you lose than from a game you win.", de: "Aus einer verlorenen Partie lernst du viel mehr als aus einer gewonnenen.", by: "José Raúl Capablanca" },
  { text: "The hardest game to win is a won game.", de: "Am schwersten zu gewinnen ist eine gewonnene Partie.", by: "Emanuel Lasker" },
  { text: "Even a poor plan is better than no plan at all.", de: "Selbst ein schlechter Plan ist besser als gar kein Plan.", by: "Mikhail Chigorin" },
  { text: "Play the opening like a book, the middlegame like a magician, and the endgame like a machine.", de: "Spiele die Eröffnung wie ein Buch, das Mittelspiel wie ein Zauberer und das Endspiel wie eine Maschine.", by: "Rudolf Spielmann" },
  { text: "Chess is a war over the board. The object is to crush the opponent's mind.", de: "Schach ist ein Krieg auf dem Brett. Das Ziel ist, den Geist des Gegners zu zermalmen.", by: "Bobby Fischer" },
  { text: "In life, as in chess, forethought wins.", de: "Im Leben wie im Schach gewinnt die Voraussicht.", by: "Charles Buxton" },
  { text: "Chess is everything: art, science, and sport.", de: "Schach ist alles: Kunst, Wissenschaft und Sport.", by: "Anatoly Karpov" },
  { text: "The beauty of a move lies not in its appearance but in the thought behind it.", de: "Die Schönheit eines Zuges liegt nicht in seinem Aussehen, sondern im Gedanken dahinter.", by: "Aron Nimzowitsch" },
  { text: "Nobody ever won a chess game by resigning.", de: "Noch niemand hat eine Schachpartie durch Aufgeben gewonnen.", by: "Savielly Tartakower" },
  { text: "Chess is a sea in which a gnat may drink and an elephant may bathe.", de: "Schach ist ein Meer, in dem eine Mücke trinken und ein Elefant baden kann.", by: "Indian proverb", byDe: "Indisches Sprichwort" },
  { text: "Help your pieces so they can help you.", de: "Hilf deinen Figuren, damit sie dir helfen können.", by: "Paul Morphy" },
  { text: "A knight on the rim is dim.", de: "Ein Springer am Rand bringt Kummer und Schand.", by: "Chess proverb", byDe: "Schachsprichwort" },
  { text: "The passed pawn is a criminal, who should be kept under lock and key.", de: "Der Freibauer ist ein Verbrecher, den man hinter Schloss und Riegel halten sollte.", by: "Aron Nimzowitsch" },
  { text: "Strategy requires thought, tactics require observation.", de: "Strategie verlangt Denken, Taktik verlangt Beobachtung.", by: "Max Euwe" },
  { text: "Chess is mental torture.", de: "Schach ist geistige Folter.", by: "Garry Kasparov" },
  { text: "Chess, like love, like music, has the power to make men happy.", de: "Schach hat wie die Liebe und die Musik die Kraft, Menschen glücklich zu machen.", by: "Siegbert Tarrasch" },
  { text: "Before the endgame, the gods have placed the middlegame.", de: "Vor das Endspiel haben die Götter das Mittelspiel gesetzt.", by: "Siegbert Tarrasch" },
  { text: "It is not enough to be a good player; you must also play well.", de: "Es reicht nicht, ein guter Spieler zu sein; man muss auch gut spielen.", by: "Siegbert Tarrasch" },
  { text: "One bad move nullifies forty good ones.", de: "Ein schlechter Zug macht vierzig gute zunichte.", by: "Israel Horowitz" },
  { text: "Chess is 99 percent tactics.", de: "Schach besteht zu 99 Prozent aus Taktik.", by: "Richard Teichmann" },
  { text: "The winner of the game is the player who makes the next-to-last mistake.", de: "Die Partie gewinnt, wer den vorletzten Fehler macht.", by: "Savielly Tartakower" },
  { text: "Openings teach you openings. Endgames teach you chess!", de: "Eröffnungen lehren dich Eröffnungen. Endspiele lehren dich Schach!", by: "Stephan Gerzadowicz" },
  { text: "Life is like a game of chess, changing with each move.", de: "Das Leben ist wie eine Schachpartie: Es ändert sich mit jedem Zug.", by: "Chinese proverb", byDe: "Chinesisches Sprichwort" },
  { text: "Chess is the art of analysis.", de: "Schach ist die Kunst der Analyse.", by: "Mikhail Botvinnik" },
  { text: "The threat is stronger than the execution.", de: "Die Drohung ist stärker als die Ausführung.", by: "Aron Nimzowitsch" },
  { text: "Without error there can be no brilliancy.", de: "Ohne Fehler gibt es keine Brillanz.", by: "Emanuel Lasker" },
  { text: "Chess demands total concentration.", de: "Schach verlangt völlige Konzentration.", by: "Bobby Fischer" },
  { text: "Chess is imagination.", de: "Schach ist Fantasie.", by: "David Bronstein" },
  { text: "Chess is a fairy tale of 1001 blunders.", de: "Schach ist ein Märchen aus 1001 Fehlern.", by: "Savielly Tartakower" },
  { text: "You have to have the fighting spirit. You have to force moves and take chances.", de: "Man braucht Kampfgeist. Man muss Züge erzwingen und Risiken eingehen.", by: "Bobby Fischer" },
  { text: "Of chess it has been said that life is not long enough for it, but that is the fault of life, not chess.", de: "Vom Schach heißt es, das Leben sei zu kurz dafür; doch das ist die Schuld des Lebens, nicht des Schachs.", by: "Irving Chernev" },
  { text: "There are two types of sacrifices: correct ones, and mine.", de: "Es gibt zwei Arten von Opfern: korrekte und meine.", by: "Mikhail Tal" },
];

/** Local calendar day → index into QUOTES, so the quote changes at midnight and never within a day. */
export function dayNumber(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400_000);
}

export function quoteOfTheDay(now: Date = new Date()): Quote {
  return QUOTES[dayNumber(now) % QUOTES.length];
}

/** The quote in the reader's language. */
export function localizedQuote(q: Quote, lang: Lang): { text: string; by: string } {
  return lang === "de" ? { text: q.de, by: q.byDe ?? q.by } : { text: q.text, by: q.by };
}
