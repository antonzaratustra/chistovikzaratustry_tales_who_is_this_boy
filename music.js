import * as Tone from 'tone';

/**
 * MidiGenerator creates mystical, mysterious atmospheric sounds
 * using Tone.js synthesis to accompany the narration.
 */
export class MidiGenerator {
    constructor(config = {}) {
        // Handle Skypack/ESM default import variation
        this.T = Tone.default || Tone;
        
        this.config = {
            musicVolume: config.musicVolume || -12,
            ambientVolume: config.ambientVolume || -25
        };

        try {
            // Volume nodes
            this.musicBus = new this.T.Volume(this.config.musicVolume).toDestination();
            this.ambientBus = new this.T.Volume(this.config.ambientVolume).toDestination();

            // High-frequency "shimmer" synth
            this.shimmerSynth = new this.T.PolySynth(this.T.FMSynth, {
                harmonicity: 3.01,
                modulationIndex: 14,
                oscillator: { type: "sine" },
                envelope: {
                    attack: 0.5,
                    decay: 0.3,
                    sustain: 0.4,
                    release: 4
                }
            });

            // Deep "drone" synth for accents
            this.droneSynth = new this.T.PolySynth(this.T.FMSynth, {
                harmonicity: 1.5,
                modulationIndex: 10,
                oscillator: { type: "sawtooth" },
                envelope: {
                    attack: 1,
                    decay: 0.5,
                    sustain: 0.8,
                    release: 5
                }
            });

            // Ambient background (low drone)
            this.ambientSynth = new this.T.FMSynth({
                harmonicity: 1,
                modulationIndex: 2,
                oscillator: { type: "sine" },
                envelope: {
                    attack: 5,
                    decay: 2,
                    sustain: 1,
                    release: 10
                }
            });

            this.ambientFilter = new this.T.Filter(200, "lowpass").connect(this.ambientBus);
            this.ambientSynth.connect(this.ambientFilter);

            // Effects chain
            this.reverb = new this.T.Reverb({
                decay: 8,
                preDelay: 0.1,
                wet: 0.6
            }).connect(this.musicBus);

            this.delay = new this.T.FeedbackDelay({
                delayTime: "4n",
                feedback: 0.4,
                wet: 0.3
            }).connect(this.musicBus);

            this.shimmerSynth.connect(this.reverb);
            this.shimmerSynth.connect(this.delay);
            this.droneSynth.connect(this.reverb);

            // Horror Slam Synth (Noise + Metal)
            this.horrorDistortion = new this.T.Distortion(0.8).connect(this.musicBus);
            this.horrorSynth = new this.T.MetalSynth({
                frequency: 80,
                envelope: {
                    attack: 0.001,
                    decay: 1.5,
                    release: 1.5
                },
                harmonicity: 5.1,
                modulationIndex: 40,
                resonance: 100,
                octaves: 1.5
            }).connect(this.horrorDistortion);

            this.noiseSynth = new this.T.NoiseSynth({
                noise: { type: "brown" },
                envelope: {
                    attack: 0.005,
                    decay: 0.2,
                    sustain: 0
                }
            }).connect(this.horrorDistortion);

            // Mystical scales (C Phrygian, C Minor, etc.)
            this.scale = ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb']; 
            this.octaves = [3, 4, 5];
            
            console.log("MidiGenerator: Synths initialized with config:", this.config);
        } catch (e) {
            console.error("MidiGenerator: Failed to initialize synths", e);
        }
    }

    /**
     * Start the audio context (must be called after user interaction)
     */
    async init() {
        await this.T.start();
        console.log("Tone.js initialized");
        
        // Start continuous ambient background
        if (this.ambientSynth) {
            this.ambientSynth.triggerAttack("C1");
            
            // Subtle modulation for the ambient filter
            const lfo = new this.T.LFO("0.05hz", 150, 400).connect(this.ambientFilter.frequency);
            lfo.start();
        }
    }

    /**
     * Plays a short, mysterious motif.
     * Ideal for transitions or pauses.
     */
    playMotif() {
        if (!this.shimmerSynth) return;
        
        const now = this.T.now();
        const numNotes = 3 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numNotes; i++) {
            const noteName = this.scale[Math.floor(Math.random() * this.scale.length)];
            const octave = this.octaves[Math.floor(Math.random() * this.octaves.length)];
            const note = `${noteName}${octave}`;
            
            const time = now + i * this.T.Time("4n").toSeconds() * (0.8 + Math.random() * 0.4);
            const duration = "2n";
            const velocity = 0.1 + Math.random() * 0.2;
            
            this.shimmerSynth.triggerAttackRelease(note, duration, time, velocity);
        }
    }

    /**
     * Plays a deep accent sound.
     * Ideal for important moments in the text.
     */
    playAccent() {
        if (!this.droneSynth) return;
        
        const now = this.T.now();
        const baseNote = "C2";
        const fifth = "G2";
        
        this.droneSynth.triggerAttackRelease(baseNote, "1n", now, 0.4);
        this.droneSynth.triggerAttackRelease(fifth, "1n", now + 0.2, 0.2);
        
        // Add a high sparkle
        if (this.shimmerSynth) {
            this.shimmerSynth.triggerAttackRelease("C5", "4n", now + 0.5, 0.1);
        }
    }

    /**
     * Horror-themed heavy slam for titles
     */
    playHorrorSlam() {
        if (!this.horrorSynth || !this.noiseSynth) return;
        
        const now = this.T.now();
        
        // Low frequency "metal" strike
        this.horrorSynth.triggerAttackRelease("C1", "1n", now, 1.0);
        
        // Brown noise burst for the "impact" feel
        this.noiseSynth.triggerAttackRelease("4n", now, 0.8);
        
        // Deep dissonant drone layers
        if (this.droneSynth) {
            this.droneSynth.triggerAttackRelease(["C1", "Db1", "Gb1"], "2n", now, 0.5);
        }
    }

    /**
     * Stops all sounds
     */
    stopAll() {
        if (this.shimmerSynth) this.shimmerSynth.releaseAll();
        if (this.droneSynth) this.droneSynth.releaseAll();
        if (this.ambientSynth) this.ambientSynth.triggerRelease();
    }
}
