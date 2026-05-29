const fs = require('fs');
const path = 'games/pikachu-volleyball/main.bundle.js';
let src = fs.readFileSync(path, 'utf8');

const patches = [
  // 1. Constructor: do NOT start suspended — let intro animation play first
  {
    name: 'constructor-init-running',
    from: 'this.questionPaused=!0,this.manualGatePaused=!1,this.rallyStartArmed=!1,this.countdownFramesLeft=0,this.gateMuted=!1,this.statusMessage="先做题"',
    to:   'this.questionPaused=!1,this.manualGatePaused=!1,this.rallyStartArmed=!1,this.countdownFramesLeft=0,this.gateMuted=!1,this.statusMessage="先做题"'
  },

  // 2. gameLoop: exempt startOfNewGame from questionPaused/manualGatePaused — let intro fade-in play
  //    (global $.paused still freezes everything as before)
  {
    name: 'gameLoop-exempt-intro',
    from: 'gameLoop(){if(!0===this.paused||this.questionPaused||this.manualGatePaused)return this.syncGateAudioPause(!0),void this.updateArabicGateStatus(this.statusMessage);',
    to:   'gameLoop(){if(!0===this.paused||(this.state!==this.startOfNewGame&&(this.questionPaused||this.manualGatePaused)))return this.syncGateAudioPause(!0),void this.updateArabicGateStatus(this.statusMessage);'
  },

  // 3. startOfNewGame end: always suspend after intro completes (regardless of lives) — user must click 继续
  {
    name: 'startOfNewGame-suspend',
    from: 'this.view.fadeInOut.setBlackAlphaTo(0),this.state=this.round',
    to:   'this.view.fadeInOut.setBlackAlphaTo(0),this.questionPaused=!0,this.statusMessage=this.rallyCredits>0?"点击继续":"先做题",this.updateArabicGateStatus(this.statusMessage),this.state=this.round'
  },

  // 4. restart: intro should replay → start with questionPaused=false so gameLoop runs startOfNewGame
  {
    name: 'restart-running',
    from: 'this.mustEarnNextRally=!0,this.rallyCredits=0,this.questionPaused=!0,this.manualGatePaused=!1,',
    to:   'this.mustEarnNextRally=!0,this.rallyCredits=0,this.questionPaused=!1,this.manualGatePaused=!1,'
  }
];

for (const p of patches) {
  const occurrences = src.split(p.from).length - 1;
  if (occurrences !== 1) {
    console.error(`FAIL: patch "${p.name}" expected 1 occurrence, found ${occurrences}`);
    process.exit(1);
  }
  src = src.replace(p.from, p.to);
  console.log(`OK: ${p.name}`);
}

fs.writeFileSync(path, src);
console.log('Bundle patched. New size:', src.length);
