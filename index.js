import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";
import { MongoClient } from "mongodb";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect().then(() => {
  db = mongoClient.db("apiBatePapoUol");
});

const participantes = joi.object({
  name: joi.string().required(),
});

const mensages = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().required().valid("message", "private_message"),
  time: joi.string(),
});

app.post("/participants", async (req, res) => {
  const participant = req.body;
  const validation = participantes.validate(participant, { abortEarly: false });
  if (validation.error) {
    const errors = validation.error.details.map((detail) => detail.message);
    res.status(422).send(errors);
    return;
  }
  try {
    const participantExist = await db
      .collection("participants")
      .findOne({ name: participant.name });
    if (participantExist) {
      res.send(409);
      return;
    }

    await db
      .collection("participants")
      .insertOne({ name: participant.name, lastStatus: Date.now() });

    await db.collection("messages").insertOne({
      from: participant.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });

    res.send(201);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    if (!participants) {
      res.status(404).send("Não foi possível encontrar nenhum participante!");
      return;
    }
    res.send(participants);
  } catch (error) {
    res.status(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  try {
    const message = {
      from: user,
      to: to,
      text: text,
      type: type,
      time: dayjs().format("HH:mm:ss"),
    };

    const validation = mensages.validate(message, { abortEarly: false });
    if (validation.error) {
      const errors = validation.error.details.map((detail) => detail.message);
      res.status(422).send(errors);
      return;
    }
    const participantExist = await db
      .collection("participants")
      .findOne({ name: user });
    if (!participantExist) {
      res.send(409);
      return;
    }

    await db.collection("messages").insertOne(message);
    res.send(201);
  } catch (error) {
    res.status(500);
  }
});

app.get("/messages", async (req, res) => {
  const { user } = req.headers;
  const limite = Number(req.query.limit);

  try {
    const messages = await db.collection("messages").find().toArray();
    const messagesFilter = messages.filter((message) => {
      const isPublica = message.type === "message";
      const toUsuario =
        message.from === user || message.to === "Todos" || message.to === user;
      return isPublica || toUsuario;
    });

    res.send(messagesFilter.slice(-limite));
  } catch (error) {
    res.status(500);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const participanteExist = await db
      .collection("participants")
      .findOne({ name: user });
    if (!participanteExist) {
      res.sendStatus(404);
      return;
    }

    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });

    res.send(200);
  } catch (error) {
    res.status(500);
  }
});

setInterval(async () => {
  console.log("removendo");
  const segundos = Date.now() - 10 * 1000;
  console.log(segundos);

  try {
    const participanteInativos = await db
      .collection("participants")
      .find({ lastStatus: { $lte: segundos } })
      .toArray();
    if (participanteInativos.length > 0) {
      const participanteInativo = participanteInativos.map(
        (participanteInativo) => {
          return {
            from: participanteInativo.name,
            to: "Todos",
            text: "sai da sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss"),
          };
        }
      );

      await db.collection("message").insertMany(participanteInativo);
      await db
        .collection("participants")
        .deleteMany({ lastStatus: { $lte: segundos } });
    }
  } catch {
    res.status(500).send(error.message);
  }
}, 15000);

app.listen(5000, () => {
  console.log("Server running in port: 5000");
});
