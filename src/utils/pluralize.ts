export function pluralizeTurns(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) {
    return `${n} ход`;
  } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
    return `${n} хода`;
  } else {
    return `${n} ходов`;
  }
}

export function pluralizeWins(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) {
    return `${n} победа`;
  } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
    return `${n} победы`;
  } else {
    return `${n} побед`;
  }
}
