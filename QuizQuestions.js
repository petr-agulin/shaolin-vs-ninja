// Default question pool for the Sacred Pagoda trial. Kid-friendly (age 8+)
// general-knowledge, multiple choice. Each entry:
//   q       — the question text
//   choices — 3–4 answer options
//   answer  — index of the correct option in `choices`
//   explain — a one-line explanation shown on the results screen
//
// Edit freely. When the game's AI integration lands, generated questions may be
// used instead; this pool remains the fallback whenever none is available.

export const QUIZ_QUESTIONS = [
  { q: "How many legs does a spider have?", choices: ["6", "8", "10", "4"], answer: 1, explain: "Spiders are arachnids and always have 8 legs." },
  { q: "Which planet is closest to the Sun?", choices: ["Venus", "Earth", "Mercury", "Mars"], answer: 2, explain: "Mercury is the first planet from the Sun." },
  { q: "What do bees make?", choices: ["Milk", "Honey", "Silk", "Bread"], answer: 1, explain: "Bees collect nectar and turn it into honey." },
  { q: "Which animal is known as the King of the Jungle?", choices: ["Tiger", "Elephant", "Lion", "Bear"], answer: 2, explain: "The lion is traditionally called the King of the Jungle." },
  { q: "How many colours are in a rainbow?", choices: ["5", "7", "9", "3"], answer: 1, explain: "A rainbow has 7 colours: red, orange, yellow, green, blue, indigo, violet." },
  { q: "What is the largest ocean on Earth?", choices: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3, explain: "The Pacific Ocean is the largest and deepest ocean." },
  { q: "Which gas do plants take in from the air?", choices: ["Oxygen", "Carbon dioxide", "Helium", "Nitrogen"], answer: 1, explain: "Plants take in carbon dioxide and give out oxygen." },
  { q: "How many days are there in a week?", choices: ["7", "5", "10", "12"], answer: 0, explain: "There are 7 days in a week." },
  { q: "What is baby frog called?", choices: ["Calf", "Tadpole", "Cub", "Kit"], answer: 1, explain: "A baby frog is a tadpole before it grows legs." },
  { q: "Which is the tallest animal in the world?", choices: ["Elephant", "Horse", "Giraffe", "Camel"], answer: 2, explain: "The giraffe is the tallest living animal, thanks to its long neck." },
  { q: "What do we call frozen water?", choices: ["Steam", "Ice", "Snowman", "Rain"], answer: 1, explain: "When water freezes it becomes solid ice." },
  { q: "How many sides does a triangle have?", choices: ["4", "3", "5", "6"], answer: 1, explain: "A triangle has 3 sides and 3 corners." },
  { q: "Which bird cannot fly?", choices: ["Sparrow", "Eagle", "Penguin", "Parrot"], answer: 2, explain: "Penguins have wings but use them to swim, not fly." },
  { q: "What colour do you get by mixing blue and yellow?", choices: ["Purple", "Green", "Orange", "Brown"], answer: 1, explain: "Blue and yellow mix to make green." },
  { q: "Which is the biggest planet in our Solar System?", choices: ["Saturn", "Earth", "Jupiter", "Neptune"], answer: 2, explain: "Jupiter is the largest planet in the Solar System." },
  { q: "What part of the plant grows underground?", choices: ["Leaf", "Flower", "Root", "Stem"], answer: 2, explain: "Roots grow underground and take in water." },
  { q: "How many months are in a year?", choices: ["10", "12", "11", "14"], answer: 1, explain: "There are 12 months in a year." },
  { q: "Which animal says 'moo'?", choices: ["Sheep", "Cow", "Goat", "Horse"], answer: 1, explain: "Cows make a 'moo' sound." },
  { q: "What do we breathe in to stay alive?", choices: ["Oxygen", "Smoke", "Carbon dioxide", "Steam"], answer: 0, explain: "We breathe in oxygen to live." },
  { q: "Which season comes after winter?", choices: ["Autumn", "Summer", "Spring", "Monsoon"], answer: 2, explain: "Spring follows winter, when flowers start to bloom." },
  { q: "What is the fastest land animal?", choices: ["Lion", "Cheetah", "Horse", "Dog"], answer: 1, explain: "The cheetah can run faster than any other land animal." },
  { q: "How many wheels does a bicycle have?", choices: ["2", "3", "4", "1"], answer: 0, explain: "A bicycle has two wheels ('bi' means two)." },
  { q: "Which fruit is yellow and curved?", choices: ["Apple", "Banana", "Grape", "Cherry"], answer: 1, explain: "A banana is long, curved and yellow." },
  { q: "What do caterpillars turn into?", choices: ["Bees", "Spiders", "Butterflies", "Ants"], answer: 2, explain: "A caterpillar changes into a butterfly." },
  { q: "How many continents are there on Earth?", choices: ["5", "6", "7", "8"], answer: 2, explain: "There are 7 continents on Earth." },
  { q: "What do we use to see?", choices: ["Ears", "Eyes", "Nose", "Hands"], answer: 1, explain: "We use our eyes to see." },
  { q: "Which is the largest land animal?", choices: ["Elephant", "Rhino", "Hippo", "Giraffe"], answer: 0, explain: "The African elephant is the largest land animal." },
  { q: "What shape is a ball?", choices: ["Square", "Sphere", "Cube", "Triangle"], answer: 1, explain: "A ball is shaped like a sphere — round all over." },
  { q: "Which liquid falls from clouds as rain?", choices: ["Milk", "Oil", "Water", "Juice"], answer: 2, explain: "Rain is water falling from the clouds." },
  { q: "How many legs does an insect have?", choices: ["6", "8", "4", "10"], answer: 0, explain: "All insects have 6 legs." },
  { q: "What is the opposite of hot?", choices: ["Warm", "Cold", "Wet", "Dry"], answer: 1, explain: "Cold is the opposite of hot." },
  { q: "Which animal is famous for a long trunk?", choices: ["Elephant", "Kangaroo", "Zebra", "Monkey"], answer: 0, explain: "Elephants have a long trunk they use like a hand." },
  { q: "What do we call a doctor for animals?", choices: ["Dentist", "Vet", "Nurse", "Chef"], answer: 1, explain: "A vet (veterinarian) is a doctor for animals." },
  { q: "How many hours are in a day?", choices: ["12", "24", "20", "36"], answer: 1, explain: "There are 24 hours in a day." },
  { q: "Which of these is a reptile?", choices: ["Frog", "Snake", "Dog", "Sparrow"], answer: 1, explain: "A snake is a reptile with scales." },
  { q: "What do plants need from the sky to grow?", choices: ["Snow", "Sunlight", "Wind", "Thunder"], answer: 1, explain: "Plants need sunlight to make their food." },
  { q: "Which is the smallest of these?", choices: ["Ant", "Cat", "Cow", "Horse"], answer: 0, explain: "An ant is the smallest of these animals." },
  { q: "What is a group of wolves called?", choices: ["Herd", "Pack", "Flock", "School"], answer: 1, explain: "A group of wolves is called a pack." },
  { q: "Which colour is the sky on a clear day?", choices: ["Green", "Blue", "Red", "Purple"], answer: 1, explain: "On a clear day the sky looks blue." },
  { q: "What do we call the star at the centre of our Solar System?", choices: ["Moon", "Sun", "Mars", "Comet"], answer: 1, explain: "The Sun is the star at the centre of our Solar System." },
  { q: "Which animal lives in a shell and moves slowly?", choices: ["Snail", "Rabbit", "Fox", "Deer"], answer: 0, explain: "A snail carries its shell and moves very slowly." },
  { q: "How many fingers are on one hand?", choices: ["4", "5", "6", "3"], answer: 1, explain: "One hand has 5 fingers (counting the thumb)." },
  { q: "What is the biggest animal in the ocean?", choices: ["Shark", "Dolphin", "Blue whale", "Octopus"], answer: 2, explain: "The blue whale is the largest animal on Earth." },
  { q: "Which of these can you eat?", choices: ["Rock", "Apple", "Sand", "Paper"], answer: 1, explain: "An apple is a fruit you can eat." },
  { q: "What do we call water falling as tiny frozen flakes?", choices: ["Rain", "Snow", "Fog", "Dew"], answer: 1, explain: "Snow is frozen water that falls as soft flakes." },
  { q: "Which animal barks?", choices: ["Cat", "Dog", "Cow", "Duck"], answer: 1, explain: "Dogs bark." },
  { q: "How many zeros are in one hundred?", choices: ["1", "2", "3", "4"], answer: 1, explain: "One hundred is written 100 — it has two zeros." },
  { q: "What is the name of our planet?", choices: ["Mars", "Earth", "Venus", "Moon"], answer: 1, explain: "We live on the planet Earth." },
  { q: "Which of these gives us light during the day?", choices: ["Moon", "Stars", "Sun", "Lamp"], answer: 2, explain: "The Sun lights up the day." },
  { q: "What do cows give us to drink?", choices: ["Juice", "Milk", "Water", "Tea"], answer: 1, explain: "Cows give us milk." },
  { q: "Which body part do we use to smell?", choices: ["Nose", "Ear", "Eye", "Tongue"], answer: 0, explain: "We smell with our nose." },
  { q: "How many players are there in a normal football (soccer) team on the field?", choices: ["9", "11", "13", "7"], answer: 1, explain: "A soccer team has 11 players on the field." },
  { q: "What is the tallest kind of plant?", choices: ["Grass", "Bush", "Tree", "Flower"], answer: 2, explain: "Trees are the tallest plants." },
  { q: "Which animal hops and carries its baby in a pouch?", choices: ["Kangaroo", "Rabbit", "Frog", "Deer"], answer: 0, explain: "A kangaroo hops and carries its joey in a pouch." },
  { q: "What colour are most bananas when ripe?", choices: ["Red", "Yellow", "Blue", "Black"], answer: 1, explain: "Ripe bananas are yellow." },
  { q: "Which of these is used to tell the time?", choices: ["Clock", "Book", "Spoon", "Shoe"], answer: 0, explain: "A clock tells the time." },
  { q: "What do we call frozen rain that falls as small ice balls?", choices: ["Hail", "Mist", "Dew", "Frost"], answer: 0, explain: "Hail is rain frozen into small balls of ice." },
  { q: "How many eyes does a person usually have?", choices: ["1", "2", "3", "4"], answer: 1, explain: "People usually have 2 eyes." },
  { q: "Which animal is known for changing its colour?", choices: ["Chameleon", "Horse", "Sheep", "Pig"], answer: 0, explain: "A chameleon can change the colour of its skin." },
  { q: "What is the opposite of day?", choices: ["Morning", "Night", "Noon", "Evening"], answer: 1, explain: "Night is the opposite of day." },
];

// Draw `n` distinct questions at random from the pool, each with its answer
// choices shuffled (so the correct option isn't always in the same position).
export function drawQuizQuestions(n = 3, rng = Math.random) {
  const pool = [...QUIZ_QUESTIONS];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const src = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const correct = src.choices[src.answer];
    const choices = [...src.choices];
    for (let j = choices.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [choices[j], choices[k]] = [choices[k], choices[j]];
    }
    out.push({ q: src.q, choices, answer: choices.indexOf(correct), explain: src.explain });
  }
  return out;
}
