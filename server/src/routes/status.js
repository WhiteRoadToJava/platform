import {Router} from 'express';
import {getStatus} from '../monitor/containers.js'
import { getSystemStatus } from '../monitor/system.js';


export const statusRouter = Router();

statusRouter.get('/status', (req, res) => {
    res.json(getStatus());
})

statusRouter.get('/system', (req, res) => {
  res.json(getSystemStatus());
});