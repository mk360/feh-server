import GameWorld from "feh-battles";

const debugWorld = new GameWorld();

const teams = [{
    name: "Corrin: Fateful Prince",
    weapon: "Yato",
    skills: {
        A: "Atk/Res Bond 3",
        B: "Pass 3",
        C: "Savage Blow 3",
        S: "",
        special: "Dragon Fang",
        assist: "Rally Def"
    },
    rarity: 5
}];

debugWorld.initiate({
    team1: teams,
    team2: teams,
});

debugWorld.generateMap();


export default debugWorld;
