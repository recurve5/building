const express = require('express');
const { Router } = require('express');

function createApp(config) {
  const app = express();
  app.use(express.json());
  return app;
}

class AppController {
  constructor(service) {
    this.service = service;
  }

  async handleRequest(req, res) {
    const data = await this.service.getData();
    res.json(data);
  }
}

module.exports = { createApp, AppController };
