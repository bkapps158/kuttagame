import type * as Party from "partykit/server";

type Card = {
  rank: string;
  suit: string;
};

export default class KuttaRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  game = {
    phase: "waiting",

    players: [] as any[],

    deck: [] as Card[],

    currentPlayer: 0,

    leadPlayer: 0,

    leadCard: null as Card | null,

    respondCard: null as Card | null,

    leadSuit: null as string | null,

    round: 1,

    winner: null as string | null,

    lastLog: "Waiting for players..."
  };

  onConnect(conn: Party.Connection) {
    conn.send(
      JSON.stringify({
        type: "state",
        game: this.maskGame(conn.id)
      })
    );
  }

  onMessage(
    message: string,
    sender: Party.Connection
  ) {
    try {
      const msg = JSON.parse(message);

      if (msg.type === "join") {
        this.handleJoin(
          sender,
          msg.name || "Player"
        );
      }

      if (msg.type === "play_card") {
        this.handlePlay(
          sender.id,
          msg.card
        );
      }

      if (msg.type === "rematch") {
        this.handleRematch();
      }
    } catch (err) {
      console.error(err);
    }
  }

  handleJoin(
    conn: Party.Connection,
    name: string
  ) {
    if (this.game.players.length >= 2) {
      conn.send(
        JSON.stringify({
          type: "error",
          message: "Room full"
        })
      );

      return;
    }

    const exists =
      this.game.players.find(
        p => p.id === conn.id
      );

    if (exists) return;

    this.game.players.push({
      id: conn.id,
      name,
      hand: [],
      tricks: 0
    });

    this.game.lastLog =
      `${name} joined`;

    if (this.game.players.length === 2) {
      this.startGame();
    }

    this.broadcastState();
  }

  startGame() {
    this.game.phase = "playing";

    this.game.deck =
      this.createDeck();

    this.shuffle(this.game.deck);

    for (let i = 0; i < 5; i++) {
      this.game.players[0].hand.push(
        this.game.deck.pop()
      );

      this.game.players[1].hand.push(
        this.game.deck.pop()
      );
    }

    let starter = 0;

    for (let i = 0; i < 2; i++) {
      const hasAce =
        this.game.players[i].hand.some(
          c =>
            c.rank === "A" &&
            c.suit === "♠"
        );

      if (hasAce) {
        starter = i;
      }
    }

    this.game.currentPlayer =
      starter;

    this.game.leadPlayer =
      starter;

    this.game.lastLog =
      `${this.game.players[starter].name} starts`;
  }

  handlePlay(
    playerId: string,
    card: Card
  ) {
    if (
      this.game.phase !==
      "playing"
    ) return;

    const playerIndex =
      this.game.players.findIndex(
        p => p.id === playerId
      );

    if (
      playerIndex !==
      this.game.currentPlayer
    ) {
      return;
    }

    const player =
      this.game.players[playerIndex];

    const cardIndex =
      player.hand.findIndex(
        c =>
          c.rank === card.rank &&
          c.suit === card.suit
      );

    if (cardIndex === -1) return;

    // Must follow suit
    if (
      this.game.leadSuit &&
      this.game.respondCard === null
    ) {
      const hasSuit =
        player.hand.some(
          c =>
            c.suit ===
            this.game.leadSuit
        );

      if (
        hasSuit &&
        card.suit !==
          this.game.leadSuit
      ) {
        return;
      }
    }

    const playedCard =
      player.hand.splice(
        cardIndex,
        1
      )[0];

    // Lead play
    if (
      this.game.leadCard ===
      null
    ) {
      this.game.leadCard =
        playedCard;

      this.game.leadSuit =
        playedCard.suit;

      this.game.currentPlayer =
        1 - playerIndex;

      this.game.lastLog =
        `${player.name} played ${playedCard.rank}${playedCard.suit}`;
    }

    // Response play
    else {
      this.game.respondCard =
        playedCard;

      this.game.lastLog =
        `${player.name} responded ${playedCard.rank}${playedCard.suit}`;

      this.resolveRound();
    }

    this.broadcastState();
  }

  resolveRound() {
    const lead =
      this.game.leadCard!;

    const response =
      this.game.respondCard!;

    const leadIdx =
      this.game.leadPlayer;

    const responseIdx =
      1 - leadIdx;

    let winner;

    if (
      lead.suit ===
      response.suit
    ) {
      winner =
        this.cardValue(
          response.rank
        ) >
        this.cardValue(
          lead.rank
        )
          ? responseIdx
          : leadIdx;
    } else {
      winner = responseIdx;
    }

    this.game.players[
      winner
    ].tricks++;

    this.game.lastLog =
      `${this.game.players[winner].name} wins round`;

    if (
      this.game.deck.length > 0
    ) {
      this.game.players[
        winner
      ].hand.push(
        this.game.deck.pop()
      );

      const loser =
        1 - winner;

      if (
        this.game.deck.length > 0
      ) {
        this.game.players[
          loser
        ].hand.push(
          this.game.deck.pop()
        );
      }
    }

    this.game.leadCard = null;
    this.game.respondCard = null;
    this.game.leadSuit = null;

    this.game.currentPlayer =
      winner;

    this.game.leadPlayer =
      winner;

    this.game.round++;

    this.checkGameEnd();
  }

  checkGameEnd() {
    const empty =
      this.game.players.every(
        p => p.hand.length === 0
      );

    if (!empty) return;

    this.game.phase =
      "finished";

    const p1 =
      this.game.players[0];

    const p2 =
      this.game.players[1];

    if (p1.tricks > p2.tricks) {
      this.game.winner =
        p1.name;
    }

    else if (
      p2.tricks > p1.tricks
    ) {
      this.game.winner =
        p2.name;
    }

    else {
      this.game.winner =
        "Draw";
    }
  }

  handleRematch() {
    const players =
      this.game.players.map(
        p => ({
          id: p.id,
          name: p.name,
          hand: [],
          tricks: 0
        })
      );

    this.game = {
      phase: "waiting",
      players,
      deck: [],
      currentPlayer: 0,
      leadPlayer: 0,
      leadCard: null,
      respondCard: null,
      leadSuit: null,
      round: 1,
      winner: null,
      lastLog: "Rematch started"
    };

    if (players.length === 2) {
      this.startGame();
    }

    this.broadcastState();
  }

  broadcastState() {
    for (const conn of this.room.getConnections()) {
      conn.send(
        JSON.stringify({
          type: "state",
          game: this.maskGame(conn.id)
        })
      );
    }
  }

  maskGame(playerId: string) {
    const game =
      structuredClone(this.game);

    game.players =
      game.players.map(p => {
        if (p.id !== playerId) {
          return {
            ...p,
            hand: p.hand.map(
              () => ({
                rank: "?",
                suit: "?"
              })
            )
          };
        }

        return p;
      });

    return game;
  }

  createDeck(): Card[] {
    const suits = [
      "♠",
      "♥",
      "♦",
      "♣"
    ];

    const ranks = [
      "2","3","4","5","6",
      "7","8","9","10",
      "J","Q","K","A"
    ];

    const deck: Card[] = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          rank,
          suit
        });
      }
    }

    return deck;
  }

  shuffle(deck: Card[]) {
    for (
      let i = deck.length - 1;
      i > 0;
      i--
    ) {
      const j =
        Math.floor(
          Math.random() *
          (i + 1)
        );

      [deck[i], deck[j]] = [
        deck[j],
        deck[i]
      ];
    }
  }

  cardValue(rank: string) {
    const values: Record<
      string,
      number
    > = {
      "2":2,
      "3":3,
      "4":4,
      "5":5,
      "6":6,
      "7":7,
      "8":8,
      "9":9,
      "10":10,
      J:11,
      Q:12,
      K:13,
      A:14
    };

    return values[rank] || 0;
  }
}