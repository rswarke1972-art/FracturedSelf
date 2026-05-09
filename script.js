// ==========================
// FRACTURED SELF SCRIPT
// ==========================

// --------------------------
// MENU FUNCTIONS
// --------------------------

function startStory() {
    window.location.href = "story.html";
}

function openCredits() {
    window.location.href = "outro.html";
}

// --------------------------
// OPTIONAL CINEMATIC TOUCHES
// --------------------------

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
});

// Smooth fade-in
window.addEventListener("load", () => {
    document.body.style.opacity = "1";
});

// ==========================
// STORY SYSTEM
// ==========================

let storyData = [];
let currentScene = 0;

// DOM Elements
const sceneImage = document.getElementById("scene-image");
const speakerName = document.getElementById("speaker-name");
const storyText = document.getElementById("story-text");

// Only run on story page
if (window.location.pathname.includes("story.html")) {
    loadStory();
}

// --------------------------
// LOAD STORY JSON
// --------------------------

async function loadStory() {
    try {

        const response = await fetch("stories.json");
        const data = await response.json();

        // Combine intro + chapter1
        storyData = [
            ...data.intro,
            ...data.chapter1
        ];

        showScene();

    } catch (error) {
        console.error("Story loading failed:", error);

        storyText.textContent =
            "Failed to load story.";

    }
}

// --------------------------
// SHOW CURRENT SCENE
// --------------------------

function showScene() {

    const scene = storyData[currentScene];

    if (!scene) {
        window.location.href = "outro.html";
        return;
    }

    // Change image
    sceneImage.src = scene.image;

    // Speaker
    if (scene.speaker === "") {

        speakerName.style.display = "none";

    } else {

        speakerName.style.display = "block";
        speakerName.textContent = scene.speaker;
    }

    // Story text
    storyText.textContent = scene.text;
}

// --------------------------
// NEXT SCENE ON CLICK
// --------------------------

document.addEventListener("click", () => {

    // Prevent clicking before loading
    if (storyData.length === 0) return;

    currentScene++;

    showScene();
});

// --------------------------
// KEYBOARD SUPPORT
// --------------------------

document.addEventListener("keydown", (event) => {

    if (
        event.key === " " ||
        event.key === "Enter" ||
        event.key === "ArrowRight"
    ) {

        currentScene++;
        showScene();
    }
});