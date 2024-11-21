const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');




const bodyParser = require('body-parser'); // Si vous utilisez une ancienne version d'Express
const axios = require('axios');
const User = require('../models/User');
const Transcription = require('../models/transcription'); // Assurez-vous de bien importer le modèle

const Meeting = require('../models/Meeting'); // Assurez-vous que le chemin est correct
require('dotenv').config();  // To load environment variables

const router = express.Router();

router.use(bodyParser.json());


// Configuration de multer pour l'upload de la photo de CIN
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/cin/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });







router.post('/register/client',  async (req, res) => {
    const { nom, email, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = new User({
        nom,
        email,
        password: hashedPassword,
        role: 'utilisateur',
       
      });
      await newUser.save();
      res.status(201).json(newUser);
    } catch (error) {
      console.error(error); // Afficher l'erreur dans la console
      res.status(500).json({ message: 'Erreur lors de l\'inscription', error: error.message });
    }
  });
  




  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      // Chercher l'utilisateur par email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "Ce compte n'existe pas, veuillez vous inscrire." });
      }
  
      // Vérifier le mot de passe
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Mot de passe incorrect." });
      }
  
     
  
      
  
      // Générer un token JWT avec l'ID de l'utilisateur
      const token = jwt.sign({ userId: user._id }, 'your_jwt_secret', { expiresIn: '5h' });
  
      // Vérifier le rôle de l'utilisateur et retourner le message approprié
      let roleMessage = "";
      switch (user.role) {
        case 'admin':
          roleMessage = "Hello admin";
          break;
        case 'utilisateur':
          roleMessage = "Hello client";
          break;
        
        default:
          return res.status(400).json({ message: "Rôle invalide." });
      }
  
      res.status(200).json({
        message: roleMessage,
        token, // Le token qui contient l'ID de l'utilisateur
        userId: user._id // L'ID de l'utilisateur connecté
      });
    } catch (error) {
      res.status(500).json({ message: "Erreur lors de la connexion", error });
    }
  });
  
  




// Route pour créer une réunion pour un utilisateur spécifique via son ID
router.post('/meeting/:userId', async (req, res) => {
    const { sujetReunion, date, heure, nombreParticipants } = req.body;
    const { userId } = req.params;  // Récupérer l'ID de l'utilisateur depuis l'URL
  
    try {
      // Vérification des données reçues
      if (!sujetReunion || !date || !heure || !nombreParticipants) {
        return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
      }
  
      // Création de la réunion dans la base de données
      const newMeeting = new Meeting({
        sujetReunion,
        date,
        heure,
        nombreParticipants,
        userId  // Associer la réunion à l'ID utilisateur passé dans l'URL
      });
  
      await newMeeting.save();
      res.status(201).json({
        message: 'Réunion créée avec succès',
        meeting: newMeeting
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Erreur lors de la création de la réunion', error: error.message });
    }
  });

// Endpoint pour la transcription de l'audio
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier audio téléchargé' });
    }

    const filePath = req.file.path;
    const audioBytes = fs.readFileSync(filePath);

    const url = 'https://api.deepgram.com/v1/listen';
    const headers = {
      'Authorization': `Token 541551308b8c945dbc05b3b3e56ef731aeb3f62f`,
      'Content-Type': 'audio/mp3',
    };

    const params = {
      language: 'fr',
      punctuate: true,
      redaction: false,
    };

    const response = await axios.post(url, audioBytes, {
      headers,
      params,
    });

    const transcription = response.data.results.channels[0].alternatives[0].transcript;

   

    const newTranscription = new Transcription({
      audioPath: filePath,
      transcript: transcription,
    });

    await newTranscription.save();
    fs.unlinkSync(filePath);

    res.json({ transcription });
  } catch (error) {
    console.error('Error during transcription:', error);
    res.status(500).json({ error: 'Something went wrong during transcription' });
  }
});  







// Route pour résumer un texte donné en utilisant OpenAI API
router.post('/summarize', async (req, res) => {
  const userText = req.body.text; // Text entered by the user

  // Vérifier si le texte est fourni
  if (!userText) {
    return res.status(400).json({ error: "Text is required." });
  }

  try {
    // Préparer les données pour l'API OpenAI
    const data = {
      model: "gpt-3.5-turbo",  // Le modèle GPT utilisé
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Please summarize the user's input in a concise way."
        },
        {
          role: "user",
          content: userText
        }
      ],
      max_tokens: 100,
      temperature: 0.5
    };

    // Envoi de la requête à l'API OpenAI
    key = process.env.API_KEY;
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      data,
      {
        headers: {
          'Authorization': `Bearer ${key}`, // Remplacez avec votre clé API
          
        }
      }
    );

    // Retourner la réponse de l'API OpenAI au client
    res.json({
      summary: response.data.choices[0].message.content
    });
  } catch (error) {
    console.error('Error with OpenAI API:', error);
    res.status(500).json({ error: 'An error occurred while summarizing the text.' });
  }
});






  module.exports = router;