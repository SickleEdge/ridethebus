export class Card {
  constructor(
    public suit: 'hearts' | 'diamonds' | 'clubs' | 'spades',
    public value: number
  ) {}

  toString(): string {
    const valueMap: { [key: number]: string } = {
      1: 'A',
      11: 'J',
      12: 'Q',
      13: 'K'
    }
    return `${valueMap[this.value] || this.value}${this.suit[0].toUpperCase()}`
  }
}

export class Deck {
  private cards: Card[] = []

  constructor() {
    this.reset()
  }

  reset(): void {
    this.cards = []
    const suits: ('hearts' | 'diamonds' | 'clubs' | 'spades')[] = ['hearts', 'diamonds', 'clubs', 'spades']
    for (const suit of suits) {
      for (let value = 1; value <= 13; value++) {
        this.cards.push(new Card(suit, value))
      }
    }
    this.shuffle()
  }

  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]]
    }
  }

  draw(): Card | null {
    return this.cards.pop() || null
  }

  get length(): number {
    return this.cards.length
  }
} 