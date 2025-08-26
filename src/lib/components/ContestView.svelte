<script lang="ts">
  // Language server will be mad about this, but it's fine
  // @ts-nocheck

  let squat = 90;
  let bench = 100;
  let deadlift = 150;
  let total = squat + bench + deadlift;

  let lifters = [
    {
      name: 'Andrzej',
      squat: [
        { attempt: 1, weight: 200, result: 'good' },
        { attempt: 2, weight: 210, result: 'good' },
        { attempt: 3, weight: 220, result: 'bad' },
      ],
      bench: [
        { attempt: 1, weight: 140, result: 'good' },
        { attempt: 2, weight: 150, result: 'bad' },
        { attempt: 3, weight: 150, result: 'bad' },
      ],
      deadlift: [
        { attempt: 1, weight: 250, result: 'good' },
        { attempt: 2, weight: 260, result: 'good' },
        { attempt: 3, weight: 270, result: 'good' },
      ]
    },
    {
      name: 'Zosia',
      squat: [
        { attempt: 1, weight: 100, result: 'good' },
        { attempt: 2, weight: 110, result: 'good' },
        { attempt: 3, weight: 120, result: 'good' },
      ],
      bench: [
        { attempt: 1, weight: 70, result: 'good' },
        { attempt: 2, weight: 75, result: 'bad' },
        { attempt: 3, weight: 75, result: 'good' },
      ],
      deadlift: [
        { attempt: 1, weight: 120, result: 'good' },
        { attempt: 2, weight: 130, result: 'good' },
        { attempt: 3, weight: 140, result: 'good' },
      ]
    }
  ]

  const getBestLift = (lifts) => {
    return lifts.reduce((max, lift) => {
      if (lift.result === 'good' && lift.weight > max) {
        return lift.weight;
      }
      return max;
    }, 0);
  }

  const getSubtotal = (lifter) => {
    return getBestLift(lifter.squat) + getBestLift(lifter.bench);
  }

  const getTotal = (lifter) => {
    return getBestLift(lifter.squat) + getBestLift(lifter.bench) + getBestLift(lifter.deadlift);
  }
</script>

<div class="container-full">
  <div class="overflow-x-auto">
    <table class="min-w-full border-collapse">
      <thead class="bg-gray-800 text-white">
        <tr>
          <th rowspan="2" class="py-2 px-4 border border-gray-600">Lifter</th>
          <th colspan="3" class="py-2 px-4 border border-gray-600">Squat</th>
          <th colspan="3" class="py-2 px-4 border border-gray-600">Bench</th>
          <th rowspan="2" class="py-2 px-4 border border-gray-600">Subtotal</th>
          <th colspan="3" class="py-2 px-4 border border-gray-600">Deadlift</th>
          <th rowspan="2" class="py-2 px-4 border border-gray-600">Total</th>
        </tr>
        <tr>
          <!-- Squat -->
          <th class="py-2 px-4 border border-gray-600">1</th>
          <th class="py-2 px-4 border border-gray-600">2</th>
          <th class="py-2 px-4 border border-gray-600">3</th>
          <!-- Bench -->
          <th class="py-2 px-4 border border-gray-600">1</th>
          <th class="py-2 px-4 border border-gray-600">2</th>
          <th class="py-2 px-4 border border-gray-600">3</th>
          <!-- Deadlift -->
          <th class="py-2 px-4 border border-gray-600">1</th>
          <th class="py-2 px-4 border border-gray-600">2</th>
          <th class="py-2 px-4 border border-gray-600">3</th>
        </tr>
      </thead>
      <tbody>
        {#each lifters as lifter}
          <tr class="text-center bg-gray-700 hover:bg-gray-600">
            <td class="py-2 px-4 border border-gray-600">{lifter.name}</td>

            <!-- Squat Attempts -->
            {#each lifter.squat as attempt}
              <td class="py-2 px-4 border border-gray-600">
                <input type="number" value="{attempt.weight}" class="w-20 bg-gray-800 text-white text-center">
              </td>
            {/each}

            <!-- Bench Attempts -->
            {#each lifter.bench as attempt}
              <td class="py-2 px-4 border border-gray-600">
                <input type="number" value="{attempt.weight}" class="w-20 bg-gray-800 text-white text-center">
              </td>
            {/each}

            <!-- Subtotal -->
            <td class="py-2 px-4 border border-gray-600">{getSubtotal(lifter)}</td>

            <!-- Deadlift Attempts -->
            {#each lifter.deadlift as attempt}
              <td class="py-2 px-4 border border-gray-600">
                <input type="number" value="{attempt.weight}" class="w-20 bg-gray-800 text-white text-center">
              </td>
            {/each}

            <!-- Total -->
            <td class="py-2 px-4 border border-gray-600">{getTotal(lifter)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
