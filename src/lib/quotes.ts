/** Famous words about the game. One is shown per calendar day, everywhere the club speaks for itself. */
export interface Quote {
  text: string;
  by: string;
}

export const QUOTES: readonly Quote[] = [
  { text: "Chess is the gymnasium of the mind.", by: "Blaise Pascal" },
  { text: "Every chess master was once a beginner.", by: "Irving Chernev" },
  { text: "When you see a good move, look for a better one.", by: "Emanuel Lasker" },
  { text: "Tactics is knowing what to do when there is something to do; strategy is knowing what to do when there is nothing to do.", by: "Savielly Tartakower" },
  { text: "The blunders are all there on the board, waiting to be made.", by: "Savielly Tartakower" },
  { text: "Chess is life in miniature. Chess is a struggle, chess is battles.", by: "Garry Kasparov" },
  { text: "I don't believe in psychology. I believe in good moves.", by: "Bobby Fischer" },
  { text: "The pin is mightier than the sword.", by: "Fred Reinfeld" },
  { text: "Chess is the struggle against the error.", by: "Johannes Zukertort" },
  { text: "You may learn much more from a game you lose than from a game you win.", by: "José Raúl Capablanca" },
  { text: "The hardest game to win is a won game.", by: "Emanuel Lasker" },
  { text: "Even a poor plan is better than no plan at all.", by: "Mikhail Chigorin" },
  { text: "Play the opening like a book, the middlegame like a magician, and the endgame like a machine.", by: "Rudolf Spielmann" },
  { text: "Chess is a war over the board. The object is to crush the opponent's mind.", by: "Bobby Fischer" },
  { text: "In life, as in chess, forethought wins.", by: "Charles Buxton" },
  { text: "Chess is everything: art, science, and sport.", by: "Anatoly Karpov" },
  { text: "The beauty of a move lies not in its appearance but in the thought behind it.", by: "Aron Nimzowitsch" },
  { text: "Nobody ever won a chess game by resigning.", by: "Savielly Tartakower" },
  { text: "Chess is a sea in which a gnat may drink and an elephant may bathe.", by: "Indian proverb" },
  { text: "Help your pieces so they can help you.", by: "Paul Morphy" },
  { text: "A knight on the rim is dim.", by: "Chess proverb" },
  { text: "The passed pawn is a criminal, who should be kept under lock and key.", by: "Aron Nimzowitsch" },
  { text: "Strategy requires thought, tactics require observation.", by: "Max Euwe" },
  { text: "Chess is mental torture.", by: "Garry Kasparov" },
  { text: "Chess, like love, like music, has the power to make men happy.", by: "Siegbert Tarrasch" },
  { text: "Before the endgame, the gods have placed the middlegame.", by: "Siegbert Tarrasch" },
  { text: "It is not enough to be a good player; you must also play well.", by: "Siegbert Tarrasch" },
  { text: "One bad move nullifies forty good ones.", by: "Israel Horowitz" },
  { text: "Chess is 99 percent tactics.", by: "Richard Teichmann" },
  { text: "The winner of the game is the player who makes the next-to-last mistake.", by: "Savielly Tartakower" },
  { text: "Openings teach you openings. Endgames teach you chess!", by: "Stephan Gerzadowicz" },
  { text: "Life is like a game of chess, changing with each move.", by: "Chinese proverb" },
  { text: "Chess is the art of analysis.", by: "Mikhail Botvinnik" },
  { text: "The threat is stronger than the execution.", by: "Aron Nimzowitsch" },
  { text: "Without error there can be no brilliancy.", by: "Emanuel Lasker" },
  { text: "Chess demands total concentration.", by: "Bobby Fischer" },
  { text: "Chess is imagination.", by: "David Bronstein" },
  { text: "Chess is a fairy tale of 1001 blunders.", by: "Savielly Tartakower" },
  { text: "You have to have the fighting spirit. You have to force moves and take chances.", by: "Bobby Fischer" },
  { text: "Of chess it has been said that life is not long enough for it, but that is the fault of life, not chess.", by: "Irving Chernev" },
  { text: "There are two types of sacrifices: correct ones, and mine.", by: "Mikhail Tal" },
];

/** Local calendar day → index into QUOTES, so the quote changes at midnight and never within a day. */
export function dayNumber(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400_000);
}

export function quoteOfTheDay(now: Date = new Date()): Quote {
  return QUOTES[dayNumber(now) % QUOTES.length];
}
