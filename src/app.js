require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const methodOverride = require('method-override');

const indexRouter = require('./routes/index');
const configRouter = require('./routes/config');
const checkRouter = require('./routes/check');
const apiRouter = require('./routes/api');
const { reloadScheduler } = require('./services/scheduler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

app.use('/', indexRouter);
app.use('/config', configRouter);
app.use('/check', checkRouter);
app.use('/api', apiRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await reloadScheduler();
});
