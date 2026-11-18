import {Router} from 'express';
import {getStatus} from '../monitor/contauners.js'

export const statusRouter = Router();

statusRouter.get('/status', (req, res) => {
    res.json(getStatus());
})