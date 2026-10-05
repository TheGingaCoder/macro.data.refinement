const numberGrid = document.getElementById("numberGrid");
const bins = document.querySelectorAll(".refinement-bin");

const ROWS = 10;
const COLUMNS = 27;
const TOTAL_NUMBERS = ROWS * COLUMNS;

/*
  Step 2:
  The field is intentionally visual-only for now.

  We generate one digit per cell so the page has the same dense, flat
  terminal appearance as the reference. Behaviour and selection come later.
*/
function buildNumberField() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < TOTAL_NUMBERS; index += 1) {
    const number = document.createElement("span");
    number.className = "data-number";
    number.textContent = Math.floor(Math.random() * 10);

    // A small deterministic set of larger values gives the field
    // the uneven scale seen in the reference without adding interaction yet.
    if (index >= 12 && index <= 15) {
      number.classList.add("emphasis-1");
    }

    if (
      (index >= 19 && index <= 22) ||
      (index >= 39 && index <= 42) ||
      (index >= 66 && index <= 68)
    ) {
      number.classList.add("emphasis-2");
    }

    fragment.appendChild(number);
  }

  numberGrid.replaceChildren(fragment);
}

function applyBinProgress() {
  bins.forEach((bin) => {
    const progress = Number(bin.dataset.progress);
    const fill = bin.querySelector(".bin-fill");
    const value = bin.querySelector(".bin-value");

    fill.style.width = `${progress}%`;
    value.textContent = `${progress}%`;
  });
}

buildNumberField();
applyBinProgress();
