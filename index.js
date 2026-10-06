import { readFile } from 'node:fs/promises';
import { Command, CommanderError } from 'commander';

const program = new Command();

program
  .name('meteostation')
  .description('CLI-програма для роботи з даними метеостанції')
  .version('1.0.0')
  .option(
    '-f, --file <path>',
    'шлях до JSON-файлу',
    'data.json'
  );

function fail(message) {
  throw new Error(message);
}

async function loadData() {
  const { file } = program.opts();

  let text;

  try {
    text = await readFile(file, 'utf8');
  } catch {
    fail(`Не вдалося відкрити файл: ${file}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    fail(`Файл ${file} містить некоректний JSON`);
  }
}

function getSensor(data, name) {
  if (!Array.isArray(data.sensors)) {
    fail('У JSON відсутній масив sensors');
  }

  const sensor = data.sensors.find(
    item =>
      item.sensorName.toLowerCase() === name.toLowerCase()
  );

  if (!sensor) {
    fail(`Датчик "${name}" не знайдено`);
  }

  return sensor;
}

// перелік.
program
  .command('list')
  .description('показати стислий список датчиків')
  .argument(
    '[limit]',
    'максимальна кількість датчиків'
  )
  .action(async limit => {
    const data = await loadData();
    let items = data.sensors ?? [];

    if (limit !== undefined) {
      const number = Number(limit);

      if (
        !Number.isInteger(number) ||
        number < 1
      ) {
        fail(
          'limit має бути додатним цілим числом'
        );
      }

      items = items.slice(0, number);
    }

    if (items.length === 0) {
      console.log('Датчиків не знайдено.');
      return;
    }

    items.forEach((sensor, index) => {
      console.log(
        `${index + 1}. ${sensor.sensorName} — ${sensor.unit}`
      );
    });
  });

// один елемент
program
  .command('show')
  .description('показати один датчик повністю')
  .argument(
    '<index>',
    'номер датчика у масиві sensors'
  )
  .action(async index => {
    const data = await loadData();
    const number = Number(index);

    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > data.sensors.length
    ) {
      fail(
        'номер датчика має відповідати існуючому елементу масиву sensors'
      );
    }

    console.log(
      JSON.stringify(
        data.sensors[number - 1],
        null,
        2
      )
    );
  });

// окреме поле
program
  .command('field')
  .description('показати значення поля за шляхом')
  .argument(
    '<path>',
    'шлях до поля, наприклад stationName або sensors.0.unit'
  )
  .action(async path => {
    const data = await loadData();

    const parts = path.split('.');
    let value = data;

    for (const part of parts) {
      if (
        value === null ||
        value === undefined ||
        !Object.prototype.hasOwnProperty.call(
          Object(value),
          part
        )
      ) {
        fail(`поле "${path}" не знайдено`);
      }

      value = value[part];
    }

    if (value === null) {
      console.log('null');
    } else if (typeof value === 'object') {
      console.log(
        JSON.stringify(value, null, 2)
      );
    } else {
      console.log(String(value));
    }
  });

// характеристики датчика
program
  .command('sensor')
  .description(
    'показати характеристики обраного датчика'
  )
  .argument(
    '<name>',
    'назва датчика'
  )
  .action(async name => {
    const data = await loadData();
    const sensor = getSensor(data, name);

    console.log(
      `Назва: ${sensor.sensorName}`
    );

    console.log(
      `Одиниця вимірювання: ${sensor.unit}`
    );

    console.log(
      `Активний: ${
        sensor.isActive ? 'так' : 'ні'
      }`
    );

    console.log(
      `Кількість показів: ${
        sensor.measurements?.length ?? 0
      }`
    );
  });

// серія показів
program
  .command('measurements')
  .description(
    'показати серію показів обраного датчика'
  )
  .argument(
    '<name>',
    'назва датчика'
  )
  .option(
    '--skip-missing',
    'пропустити відсутні значення null'
  )
  .action(async (name, options) => {
    const data = await loadData();
    const sensor = getSensor(data, name);

    let measurements =
      sensor.measurements ?? [];

    if (options.skipMissing) {
      measurements =
        measurements.filter(
          item => item.value !== null
        );
    }

    measurements.forEach(item => {
      console.log(
        `${item.time}: ${
          item.value === null
            ? 'відсутнє значення'
            : item.value + ' ' + sensor.unit
        }`
      );
    });
  });

// статистика
program
  .command('stats')
  .description(
    'показати мінімум, максимум і середнє значення датчика'
  )
  .argument(
    '<name>',
    'назва датчика'
  )
  .option(
    '-d, --digits <number>',
    'кількість знаків після коми',
    '2'
  )
  .action(async (name, options) => {
    const data = await loadData();
    const sensor = getSensor(data, name);

    const digits = Number(options.digits);

    if (
      !Number.isInteger(digits) ||
      digits < 0 ||
      digits > 10
    ) {
      fail(
        'digits має бути цілим числом від 0 до 10'
      );
    }

    const values =
      (sensor.measurements ?? [])
        .map(item => item.value)
        .filter(
          value =>
            typeof value === 'number' &&
            Number.isFinite(value)
        );

    if (values.length === 0) {
      fail(
        'немає числових показів для обчислення статистики'
      );
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    const avg =
      values.reduce(
        (sum, value) => sum + value,
        0
      ) / values.length;

    console.log(
      `Мінімум: ${min.toFixed(digits)} ${sensor.unit}`
    );

    console.log(
      `Максимум: ${max.toFixed(digits)} ${sensor.unit}`
    );

    console.log(
      `Середнє: ${avg.toFixed(digits)} ${sensor.unit}`
    );
  });

// обробка help, version та помилок
program.exitOverride();

try {
  await program.parseAsync();
} catch (error) {
  if (
    error instanceof CommanderError &&
    (
      error.code === 'commander.helpDisplayed' ||
      error.code === 'commander.version'
    )
  ) {
    process.exitCode = 0;
  } else if (error instanceof CommanderError) {
    if (
      error.code === 'commander.missingArgument'
    ) {
      console.error(
        'Помилка: не вказано обов’язковий аргумент'
      );
    } else if (
      error.code === 'commander.unknownOption'
    ) {
      console.error(
        'Помилка: вказано невідому опцію'
      );
    } else {
      console.error(
        'Помилка: некоректний виклик програми'
      );
    }

    process.exitCode = 1;
  } else {
    console.error(
      `Помилка: ${error.message}`
    );

    process.exitCode = 1;
  }
}