import {Router} from 'express';
import {getStatus} from '../monitor/containers.js'

export const statusRouter = Router();

statusRouter.get('/status', (req, res) => {
    res.json(getStatus());
})