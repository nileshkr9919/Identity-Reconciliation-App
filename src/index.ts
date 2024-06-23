import express from 'express';
import {ContactService} from './services';
import {PrismaClient} from '@prisma/client';
import requestLogger from './middlewares/logger.middleware';
import logger from './utils/logger.util';
const app = express();
app.use(express.json());
app.use(requestLogger);

const contactService = new ContactService(new PrismaClient());

app.post('/identify', async (req, res) => {
  const {email, phoneNumber} = req.body;
  try {
    if (!email && !phoneNumber) {
      logger.error('Bad Request. Email or phoneNumber is required.');
      return res
        .status(400)
        .json({message: 'Email or phoneNumber is required.'});
    }
    const result = await contactService.identify(
      email,
      phoneNumber ? String(phoneNumber) : phoneNumber,
    );
    res.status(200).json(result);
  } catch (error) {
    logger.error(error);
    res.status(500).json({error: 'Internal Server Error'});
  }
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
