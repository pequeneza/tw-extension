// ==UserScript==
// @name        Renomeador de Ataques (eyeZ) - Mass Label com Delay 60s+
// @author      mama aqui / fixed
// @match       https://pt111.tribalwars.com.pt/*screen=overview_villages&mode=incomings*
// @version     1.2
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    // Minimum delay before ANY action: 60 seconds
    const minDelaySeconds = 120;
    // Add random extra time: 0 to 30 seconds (total 60–90s)
    const randomExtraMs = Math.random() * 30000;

    const totalInitialDelayMs = (minDelaySeconds * 1000) + randomExtraMs;

    console.log(`Aguardando ${Math.round(totalInitialDelayMs / 1000)} segundos antes de iniciar...`);

    setTimeout(() => {
        // 1. Select all checkboxes
        const selectAll = document.querySelector('input#select_all.selectAll');
        if (selectAll && !selectAll.checked) {
            selectAll.click();
            console.log("Todos os ataques selecionados.");
        } else if (!selectAll) {
            console.log("Botão 'selecionar todos' não encontrado. Página pode não estar carregada.");
            return;
        }

        // Small pause after select all (simulate human)
        setTimeout(() => {
            // 2. Select first label radio button (change [0] to [1]/[2] if you want another label)
            const labelRadios = document.getElementsByName("label");
            if (labelRadios && labelRadios.length > 0) {
                if (!labelRadios[0].checked) {
                    labelRadios[0].click();
                    console.log("Primeira configuração de etiqueta selecionada.");
                }

                // Another small human-like pause
                setTimeout(() => {
                    // 3. Click the "Etiqueta" submit button
                    const labelButton = document.querySelector('input[type="submit"][name="label"][value="Etiqueta"]');

                    if (labelButton) {
                        labelButton.click();
                        console.log("Botão 'Etiqueta' clicado → etiquetando os ataques selecionados!");
                    } else {
                        console.log("Botão 'Etiqueta' não encontrado. Verifique o HTML da página.");
                        // Fallback: try to submit the form directly
                        const form = document.querySelector('#incomings-form, form[action*="label"], form');
                        if (form) {
                            form.submit();
                            console.log("Formulário submetido via fallback.");
                        }
                    }
                }, 800 + Math.random() * 700); // 0.8–1.5s extra delay

            } else {
                console.log("Nenhuma opção de etiqueta (radio) encontrada.");
            }
        }, 1200 + Math.random() * 800); // 1.2–2s pause after select all

    }, totalInitialDelayMs);

})();