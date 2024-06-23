import {Request, Response, NextFunction} from 'express';
import logger from '../utils/logger.util';

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = new Date().getTime();

  res.on('finish', () => {
    const duration = new Date().getTime() - start;
    logger.info(
      `Request ${req.method} ${req.originalUrl} Completed with status ${res.statusCode} in ${duration}ms`,
    );
  });

  next();
};

export default requestLogger;
